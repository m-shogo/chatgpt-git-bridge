import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');
const must = (condition, message) => {
  if (!condition) throw new Error(message);
};

const manifest = JSON.parse(read('examples/manifest.v1.example.json'));
const schema = JSON.parse(read('schema/manifest.schema.json'));
const gas = read('gas/Code.gs');
const readme = read('README.md');

const required = ['version', 'taskId', 'repo', 'branch', 'path', 'sourceFile', 'sha256'];
for (const key of required) {
  must(schema.required.includes(key), `schema missing required field: ${key}`);
  must(Object.hasOwn(manifest, key), `example manifest missing field: ${key}`);
}

must(manifest.version === 1, 'example manifest version must be 1');
must(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(manifest.repo), 'invalid example repo');
must(/^[a-f0-9]{64}$/.test(manifest.sha256), 'invalid example sha256');
must(!manifest.path.startsWith('/'), 'example path must be repo-relative');
must(!manifest.path.includes('..'), 'example path may not contain ..');
must(!/[\\/]/.test(manifest.sourceFile), 'sourceFile must be a basename');

const gasContracts = [
  'function processQueue()',
  'function install30MinuteTrigger()',
  'function assertBranchExists_',
  'function getGithubRawBytes_',
  'function findTaskFoldersRecursively_',
  'LockService.getScriptLock()',
  'REMOTE_SHA_MISMATCH',
  'SOURCE_SHA_MISMATCH',
  'PATH_CONFLICT',
  'REPO_NOT_ALLOWED',
  'BRANCH_NOT_FOUND',
];
for (const token of gasContracts) {
  must(gas.includes(token), `GAS contract missing: ${token}`);
}

const requiredDocs = [
  'docs/SETUP.md',
  'docs/OPERATIONS.md',
  'docs/DECISIONS.md',
  'docs/EXPERIMENTS.md',
  'docs/ROADMAP.md',
  'docs/TESTING.md',
];
for (const path of requiredDocs) {
  must(fs.existsSync(path), `missing foundation doc: ${path}`);
}

must(readme.includes('Current best'), 'README must identify the current best approach');
must(readme.includes('Evolution policy'), 'README must define evolution policy');
must(readme.includes('GitHubからraw bytesをread-back'), 'README must document byte read-back verification');

console.log('preflight: PASS');
