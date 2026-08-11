const CONFIG = {
  incomingFolderId: '1fCCE6FNjazA5ZOtgTGyuh2nRaZueAOfz',
  processingFolderId: '1QMZEBaeb9dcmUoH0HXaALRhW2WZy_w3z',
  failedFolderId: '16R0HPmmaXq_fnzIyqv5ggtaqFERh_ueh',
  maxTasksPerRun: 10,
  maxRetries: 3,
};

/**
 * Queue contract
 *
 * Drive layout is organizational only:
 * incoming/<repo>/<branch-safe-name>/<task>/image + manifest.json
 *
 * manifest.json is authoritative for repo / branch / target path.
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
  } finally {
    lock.releaseLock();
  }
}

function processTaskSafely_(taskFolder) {
  const props = PropertiesService.getScriptProperties();
  const retryKey = `retry:${taskFolder.getId()}`;

  try {
    moveTaskToRoot_(taskFolder, CONFIG.processingFolderId);
    processTask_(taskFolder);
    props.deleteProperty(retryKey);
    permanentlyDeleteDriveItem_(taskFolder.getId());
  } catch (error) {
    const retries = Number(props.getProperty(retryKey) || '0') + 1;
    props.setProperty(retryKey, String(retries));
    writeError_(taskFolder, error, retries);

    if (!isTransient_(error) || retries >= CONFIG.maxRetries) {
      moveTaskToRoot_(taskFolder, CONFIG.failedFolderId);
      props.deleteProperty(retryKey);
    }
  }
}

function processTask_(taskFolder) {
  const manifestFile = getSingleFileByName_(taskFolder, 'manifest.json');
  const manifest = JSON.parse(manifestFile.getBlob().getDataAsString('UTF-8'));
  validateManifest_(manifest);

  const allowed = getAllowedRepos_();
  if (!allowed.includes(manifest.repo)) {
    throw new Error(`REPO_NOT_ALLOWED: ${manifest.repo}`);
  }

  const branch = manifest.branch || getDefaultBranch_(manifest.repo);
  assertBranchExists_(manifest.repo, branch);

  const source = getSingleFileByName_(taskFolder, manifest.sourceFile);
  const bytes = source.getBlob().getBytes();
  const localSha = sha256Hex_(bytes);

  if (localSha !== String(manifest.sha256).toLowerCase()) {
    throw new Error(`SOURCE_SHA_MISMATCH: expected=${manifest.sha256} actual=${localSha}`);
  }

  const existing = getGithubFileMeta_(manifest.repo, manifest.path, branch);
  if (existing.exists) {
    const currentBytes = getGithubRawBytes_(manifest.repo, manifest.path, branch);
    const currentSha = sha256Hex_(currentBytes);

    if (currentSha === localSha) {
      return; // Idempotent success. No duplicate commit.
    }

    if (!manifest.overwrite) {
      throw new Error(`PATH_CONFLICT: ${manifest.path}`);
    }
  }

  putGithubFile_(
    manifest.repo,
    manifest.path,
    branch,
    bytes,
    existing.sha,
    manifest.commitMessage,
  );

  // Upload is not considered successful until bytes are read back from GitHub.
  const remoteBytes = getGithubRawBytes_(manifest.repo, manifest.path, branch);
  const remoteSha = sha256Hex_(remoteBytes);
  if (remoteSha !== localSha) {
    throw new Error(`REMOTE_SHA_MISMATCH: expected=${localSha} actual=${remoteSha}`);
  }
}

function validateManifest_(m) {
  if (m.version !== 1) throw new Error(`MANIFEST_UNSUPPORTED_VERSION: ${m.version}`);

  ['taskId', 'repo', 'branch', 'path', 'sourceFile', 'sha256'].forEach(k => {
    if (!m[k] || typeof m[k] !== 'string') {
      throw new Error(`MANIFEST_INVALID: ${k}`);
    }
  });

  if (!/^[0-9a-fA-F]{64}$/.test(m.sha256)) {
    throw new Error('MANIFEST_INVALID: sha256');
  }
  if (m.path.startsWith('/') || m.path.includes('..')) {
    throw new Error('MANIFEST_INVALID: path');
  }
  if (m.sourceFile.includes('/') || m.sourceFile.includes('..')) {
    throw new Error('MANIFEST_INVALID: sourceFile');
  }
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(m.repo)) {
    throw new Error('MANIFEST_INVALID: repo');
  }
}

function getAllowedRepos_() {
  const raw = PropertiesService.getScriptProperties().getProperty('ALLOWED_REPOS') || '';
  return raw.split(',').map(s => s.trim()).filter(Boolean);
}

function githubHeaders_(accept) {
  const token = PropertiesService.getScriptProperties().getProperty('GITHUB_TOKEN');
  if (!token) throw new Error('CONFIG_MISSING: GITHUB_TOKEN');

  return {
    Authorization: `Bearer ${token}`,
    Accept: accept || 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

function getDefaultBranch_(repo) {
  const r = githubFetch_(`https://api.github.com/repos/${repo}`, {
    headers: githubHeaders_(),
  });
  return JSON.parse(r.getContentText()).default_branch;
}

function assertBranchExists_(repo, branch) {
  const url = `https://api.github.com/repos/${repo}/branches/${encodeURIComponent(branch)}`;
  const r = UrlFetchApp.fetch(url, {
    headers: githubHeaders_(),
    muteHttpExceptions: true,
  });
  if (r.getResponseCode() === 404) {
    throw new Error(`BRANCH_NOT_FOUND: ${repo}@${branch}`);
  }
  assertGithubSuccess_(r);
}

function getGithubFileMeta_(repo, path, branch) {
  const url = `https://api.github.com/repos/${repo}/contents/${encodePath_(path)}?ref=${encodeURIComponent(branch)}`;
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
  const url = `https://api.github.com/repos/${repo}/contents/${encodePath_(path)}?ref=${encodeURIComponent(branch)}`;
  const r = githubFetch_(url, {
    headers: githubHeaders_('application/vnd.github.raw+json'),
  });
  return r.getBlob().getBytes();
}

function putGithubFile_(repo, path, branch, bytes, existingSha, commitMessage) {
  const payload = {
    message: commitMessage || `assets: import ${path.split('/').pop()} from ChatGPT Drive bridge`,
    content: Utilities.base64Encode(bytes),
    branch,
  };
  if (existingSha) payload.sha = existingSha;

  const url = `https://api.github.com/repos/${repo}/contents/${encodePath_(path)}`;
  githubFetch_(url, {
    method: 'put',
    contentType: 'application/json',
    headers: githubHeaders_(),
    payload: JSON.stringify(payload),
  });
}

function githubFetch_(url, options) {
  const r = UrlFetchApp.fetch(url, Object.assign({ muteHttpExceptions: true }, options));
  assertGithubSuccess_(r);
  return r;
}

function assertGithubSuccess_(response) {
  const code = response.getResponseCode();
  if (code >= 200 && code < 300) return;

  const error = new Error(`GITHUB_HTTP_${code}: ${response.getContentText().slice(0, 500)}`);
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

function moveTaskToRoot_(folder, destinationId) {
  const destination = DriveApp.getFolderById(destinationId);
  folder.moveTo(destination);
}

function writeError_(folder, error, retryCount) {
  const old = folder.getFilesByName('error.json');
  while (old.hasNext()) old.next().setTrashed(true);

  folder.createFile(
    'error.json',
    JSON.stringify({
      at: new Date().toISOString(),
      retryCount,
      message: String((error && error.message) || error),
    }, null, 2),
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
    throw new Error(`DRIVE_DELETE_FAILED_${code}: ${r.getContentText()}`);
  }
}

function install30MinuteTrigger() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'processQueue')
    .forEach(t => ScriptApp.deleteTrigger(t));

  ScriptApp.newTrigger('processQueue').timeBased().everyMinutes(30).create();
}
