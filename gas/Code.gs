const CONFIG = {
  incomingFolderId: '1fCCE6FNjazA5ZOtgTGyuh2nRaZueAOfz',
  processingFolderId: '1QMZEBaeb9dcmUoH0HXaALRhW2WZy_w3z',
  failedFolderId: '16R0HPmmaXq_fnzIyqv5ggtaqFERh_ueh',
  maxTasksPerRun: 10,
  maxRetries: 3,
  maxSourceBytes: 10 * 1024 * 1024,
};

/**
 * Queue contract
 *
 * Drive layout:
 * <status>/<repo>/<branch-safe-name>/<task>/image + manifest.json
 *
 * The Drive hierarchy is for visibility. manifest.json is authoritative for
 * repo / branch / destination path.
 */
function processQueue() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return;

  try {
    const processing = DriveApp.getFolderById(CONFIG.processingFolderId);
    const incoming = DriveApp.getFolderById(CONFIG.incomingFolderId);
    const tasks = [
      ...findTaskFoldersRecursively_(processing),
      ...findTaskFoldersRecursively_(incoming),
    ].slice(0, CONFIG.maxTasksPerRun);

    tasks.forEach(processTaskSafely_);
    cleanupStatusTree_(CONFIG.incomingFolderId);
    cleanupStatusTree_(CONFIG.processingFolderId);
  } finally {
    lock.releaseLock();
  }
}

function processTaskSafely_(taskFolder) {
  const props = PropertiesService.getScriptProperties();
  const retryKey = `retry:${taskFolder.getId()}`;
  const sourceParents = captureParentChain_(taskFolder);
  let processingRoute = null;

  try {
    processingRoute = moveTaskToStatus_(taskFolder, CONFIG.processingFolderId);
    cleanupEmptyFoldersDeep_(sourceParents);

    processTask_(taskFolder);
    props.deleteProperty(retryKey);

    permanentlyDeleteDriveItem_(taskFolder.getId());
    cleanupEmptyFoldersDeep_([
      processingRoute.branchFolderId,
      processingRoute.repoFolderId,
    ]);
  } catch (error) {
    const retries = Number(props.getProperty(retryKey) || '0') + 1;
    props.setProperty(retryKey, String(retries));
    writeError_(taskFolder, error, retries);

    if (!isTransient_(error) || retries >= CONFIG.maxRetries) {
      const failedRoute = moveTaskToStatus_(taskFolder, CONFIG.failedFolderId);
      props.deleteProperty(retryKey);

      if (processingRoute) {
        cleanupEmptyFoldersDeep_([
          processingRoute.branchFolderId,
          processingRoute.repoFolderId,
        ]);
      }

      void failedRoute;
    }
  }
}

function processTask_(taskFolder) {
  const manifest = readManifest_(taskFolder);
  validateManifest_(manifest);

  if (!isRepoAllowed_(manifest.repo)) {
    throw new Error(`REPO_NOT_ALLOWED: ${manifest.repo}`);
  }

  assertRepoAccessible_(manifest.repo);
  assertBranchExists_(manifest.repo, manifest.branch);

  const source = getSingleFileByName_(taskFolder, manifest.sourceFile);
  const sourceSize = Number(source.getSize());
  if (sourceSize > CONFIG.maxSourceBytes) {
    throw new Error(
      `SOURCE_TOO_LARGE: bytes=${sourceSize} max=${CONFIG.maxSourceBytes}`,
    );
  }

  const bytes = source.getBlob().getBytes();
  const localSha = sha256Hex_(bytes);

  if (localSha !== String(manifest.sha256).toLowerCase()) {
    throw new Error(
      `SOURCE_SHA_MISMATCH: expected=${manifest.sha256} actual=${localSha}`,
    );
  }

  const existing = getGithubFileMeta_(
    manifest.repo,
    manifest.path,
    manifest.branch,
  );

  if (existing.exists) {
    const currentBytes = getGithubRawBytes_(
      manifest.repo,
      manifest.path,
      manifest.branch,
    );
    const currentSha = sha256Hex_(currentBytes);

    if (currentSha === localSha) {
      return;
    }

    if (!manifest.overwrite) {
      throw new Error(`PATH_CONFLICT: ${manifest.path}`);
    }
  }

  putGithubFile_(
    manifest.repo,
    manifest.path,
    manifest.branch,
    bytes,
    existing.sha,
    manifest.commitMessage,
  );

  const remoteBytes = getGithubRawBytes_(
    manifest.repo,
    manifest.path,
    manifest.branch,
  );
  const remoteSha = sha256Hex_(remoteBytes);
  if (remoteSha !== localSha) {
    throw new Error(
      `REMOTE_SHA_MISMATCH: expected=${localSha} actual=${remoteSha}`,
    );
  }
}

function readManifest_(folder) {
  const manifestFile = getSingleFileByName_(folder, 'manifest.json');
  return JSON.parse(manifestFile.getBlob().getDataAsString('UTF-8'));
}

function readManifestForRouting_(folder) {
  try {
    return readManifest_(folder);
  } catch (_) {
    return {};
  }
}

function validateManifest_(m) {
  if (m.version !== 1) {
    throw new Error(`MANIFEST_UNSUPPORTED_VERSION: ${m.version}`);
  }

  ['taskId', 'repo', 'branch', 'path', 'sourceFile', 'sha256'].forEach(k => {
    if (!m[k] || typeof m[k] !== 'string') {
      throw new Error(`MANIFEST_INVALID: ${k}`);
    }
  });

  if (!/^[0-9a-fA-F]{64}$/.test(m.sha256)) {
    throw new Error('MANIFEST_INVALID: sha256');
  }
  if (m.path.startsWith('/') || m.path.includes('..') || m.path.includes('//')) {
    throw new Error('MANIFEST_INVALID: path');
  }
  if (/[\\/]/.test(m.sourceFile) || m.sourceFile.includes('..')) {
    throw new Error('MANIFEST_INVALID: sourceFile');
  }
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(m.repo)) {
    throw new Error('MANIFEST_INVALID: repo');
  }
}

function getAllowedRepoRules_() {
  const raw =
    PropertiesService.getScriptProperties().getProperty('ALLOWED_REPOS') || '';
  return raw.split(',').map(s => s.trim()).filter(Boolean);
}

function isRepoAllowed_(repo) {
  return getAllowedRepoRules_().some(rule => {
    if (/^[A-Za-z0-9_.-]+\/\*$/.test(rule)) {
      const owner = rule.slice(0, -2);
      return repo.startsWith(`${owner}/`);
    }
    return repo === rule;
  });
}

function githubHeaders_(accept) {
  const token =
    PropertiesService.getScriptProperties().getProperty('GITHUB_TOKEN');
  if (!token) throw new Error('CONFIG_MISSING: GITHUB_TOKEN');

  return {
    Authorization: `Bearer ${token}`,
    Accept: accept || 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

function assertRepoAccessible_(repo) {
  const url = `https://api.github.com/repos/${repo}`;
  const r = UrlFetchApp.fetch(url, {
    headers: githubHeaders_(),
    muteHttpExceptions: true,
  });

  const code = r.getResponseCode();
  if (code === 404) {
    throw new Error(
      `REPO_NOT_VISIBLE_TO_TOKEN: ${repo} (check Fine-grained PAT Repository access)`,
    );
  }
  if (code === 401) {
    throw new Error('GITHUB_TOKEN_INVALID_OR_EXPIRED');
  }
  if (code === 403) {
    throw new Error(`GITHUB_REPO_FORBIDDEN: ${repo}`);
  }
  assertGithubSuccess_(r);
}

function assertBranchExists_(repo, branch) {
  const url =
    `https://api.github.com/repos/${repo}/branches/${encodeURIComponent(branch)}`;
  const r = UrlFetchApp.fetch(url, {
    headers: githubHeaders_(),
    muteHttpExceptions: true,
  });

  const code = r.getResponseCode();
  if (code === 404) {
    throw new Error(`BRANCH_NOT_FOUND: ${repo}@${branch}`);
  }
  if (code === 401) {
    throw new Error('GITHUB_TOKEN_INVALID_OR_EXPIRED');
  }
  if (code === 403) {
    throw new Error(`GITHUB_BRANCH_FORBIDDEN: ${repo}@${branch}`);
  }
  assertGithubSuccess_(r);
}

function getGithubFileMeta_(repo, path, branch) {
  const url =
    `https://api.github.com/repos/${repo}/contents/${encodePath_(path)}` +
    `?ref=${encodeURIComponent(branch)}`;
  const r = UrlFetchApp.fetch(url, {
    headers: githubHeaders_(),
    muteHttpExceptions: true,
  });

  if (r.getResponseCode() === 404) return { exists: false, sha: null };
  assertGithubSuccess_(r);
  const body = JSON.parse(r.getContentText());
  return { exists: true, sha: body.sha };
}

function getGithubRawBytes_(repo, path, branch) {
  const url =
    `https://api.github.com/repos/${repo}/contents/${encodePath_(path)}` +
    `?ref=${encodeURIComponent(branch)}`;
  const r = githubFetch_(url, {
    headers: githubHeaders_('application/vnd.github.raw+json'),
  });
  return r.getBlob().getBytes();
}

function putGithubFile_(repo, path, branch, bytes, existingSha, commitMessage) {
  const payload = {
    message:
      commitMessage ||
      `assets: import ${path.split('/').pop()} from ChatGPT Drive bridge`,
    content: Utilities.base64Encode(bytes),
    branch,
  };
  if (existingSha) payload.sha = existingSha;

  const url =
    `https://api.github.com/repos/${repo}/contents/${encodePath_(path)}`;
  githubFetch_(url, {
    method: 'put',
    contentType: 'application/json',
    headers: githubHeaders_(),
    payload: JSON.stringify(payload),
  });
}

function githubFetch_(url, options) {
  const r = UrlFetchApp.fetch(
    url,
    Object.assign({ muteHttpExceptions: true }, options),
  );
  assertGithubSuccess_(r);
  return r;
}

function assertGithubSuccess_(response) {
  const code = response.getResponseCode();
  if (code >= 200 && code < 300) return;

  const error = new Error(
    `GITHUB_HTTP_${code}: ${response.getContentText().slice(0, 500)}`,
  );
  error.httpCode = code;
  throw error;
}

function isTransient_(error) {
  const code = Number(error.httpCode || 0);
  return (
    code === 408 ||
    code === 429 ||
    code >= 500 ||
    /timed out|Service invoked too many times/i.test(String(error))
  );
}

function sha256Hex_(bytes) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes)
    .map(b => (b + 256) % 256)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

function encodePath_(path) {
  return path.split('/').map(encodeURIComponent).join('/');
}

function findTaskFoldersRecursively_(rootFolder) {
  const out = [];

  function walk_(folder) {
    if (folder.getFilesByName('manifest.json').hasNext()) {
      out.push(folder);
      return;
    }

    const children = folder.getFolders();
    while (children.hasNext()) walk_(children.next());
  }

  walk_(rootFolder);
  return out;
}

function getSingleFileByName_(folder, name) {
  const it = folder.getFilesByName(name);
  if (!it.hasNext()) throw new Error(`FILE_MISSING: ${name}`);

  const file = it.next();
  if (it.hasNext()) throw new Error(`FILE_DUPLICATED: ${name}`);
  return file;
}

function captureParentChain_(taskFolder) {
  const out = [];
  let current = taskFolder;

  for (let i = 0; i < 2; i += 1) {
    const parents = current.getParents();
    if (!parents.hasNext()) break;
    current = parents.next();
    out.push(current.getId());
  }

  return out;
}

function moveTaskToStatus_(taskFolder, statusRootId) {
  const manifest = readManifestForRouting_(taskFolder);
  const repoName =
    typeof manifest.repo === 'string' && manifest.repo.includes('/')
      ? manifest.repo.split('/').pop()
      : '_invalid';
  const branchName =
    typeof manifest.branch === 'string' && manifest.branch
      ? manifest.branch.replace(/\//g, '__')
      : '_invalid';

  const statusRoot = DriveApp.getFolderById(statusRootId);
  const repoFolder = getOrCreateChildFolder_(
    statusRoot,
    safeFolderSegment_(repoName),
  );
  const branchFolder = getOrCreateChildFolder_(
    repoFolder,
    safeFolderSegment_(branchName),
  );

  taskFolder.moveTo(branchFolder);
  return {
    repoFolderId: repoFolder.getId(),
    branchFolderId: branchFolder.getId(),
  };
}

function getOrCreateChildFolder_(parent, name) {
  const it = parent.getFoldersByName(name);
  if (it.hasNext()) return it.next();
  return parent.createFolder(name);
}

function safeFolderSegment_(value) {
  const cleaned = String(value)
    .replace(/[\\/:*?"<>|]/g, '__')
    .replace(/\s+/g, '-')
    .slice(0, 180);
  return cleaned || '_invalid';
}

function cleanupEmptyFoldersDeep_(folderIds) {
  folderIds.forEach(id => {
    if (!id) return;
    try {
      const folder = DriveApp.getFolderById(id);
      if (!folder.getFiles().hasNext() && !folder.getFolders().hasNext()) {
        permanentlyDeleteDriveItem_(id);
      }
    } catch (_) {
      // Best effort cleanup only.
    }
  });
}

function cleanupStatusTree_(rootId) {
  try {
    const root = DriveApp.getFolderById(rootId);
    const repos = root.getFolders();
    const repoIds = [];

    while (repos.hasNext()) {
      const repo = repos.next();
      const branches = repo.getFolders();
      const branchIds = [];
      while (branches.hasNext()) branchIds.push(branches.next().getId());
      cleanupEmptyFoldersDeep_(branchIds);
      repoIds.push(repo.getId());
    }

    cleanupEmptyFoldersDeep_(repoIds);
  } catch (_) {
    // Best effort cleanup only.
  }
}

function writeError_(folder, error, retryCount) {
  const old = folder.getFilesByName('error.json');
  while (old.hasNext()) old.next().setTrashed(true);

  folder.createFile(
    'error.json',
    JSON.stringify(
      {
        at: new Date().toISOString(),
        retryCount,
        message: String((error && error.message) || error),
      },
      null,
      2,
    ),
    MimeType.PLAIN_TEXT,
  );
}

function permanentlyDeleteDriveItem_(fileId) {
  const r = UrlFetchApp.fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`,
    {
      method: 'delete',
      headers: { Authorization: `Bearer ${ScriptApp.getOAuthToken()}` },
      muteHttpExceptions: true,
    },
  );

  const code = r.getResponseCode();
  if (code !== 204 && code !== 404) {
    throw new Error(
      `DRIVE_DELETE_FAILED_${code}: ${r.getContentText()}`,
    );
  }
}

function install5MinuteTrigger() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'processQueue')
    .forEach(t => ScriptApp.deleteTrigger(t));

  ScriptApp.newTrigger('processQueue').timeBased().everyMinutes(5).create();
}
