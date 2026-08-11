# Setup

## 1. Google Drive

Create this structure in My Drive:

```text
ChatGPT-Git-Bridge/
├─ incoming/
├─ processing/
└─ failed/
```

Current prepared folder IDs:

- root: `1TPg9sXKN8je9mwBE2_xv3mRQzFaM2WOp`
- incoming: `1fCCE6FNjazA5ZOtgTGyuh2nRaZueAOfz`
- processing: `1QMZEBaeb9dcmUoH0HXaALRhW2WZy_w3z`
- failed: `16R0HPmmaXq_fnzIyqv5ggtaqFERh_ueh`

Recommended incoming layout:

```text
incoming/
└─ <repo-name>/
   └─ <branch-safe-name>/
      └─ <task-id>/
         ├─ image.png
         └─ manifest.json
```

The folder path is for humans only. `manifest.json` is authoritative.

## 2. Google Apps Script

Create one standalone Apps Script project.

Copy:

- `gas/Code.gs`
- `gas/appsscript.json`

If the Drive folder IDs change, update `CONFIG` in `Code.gs`.

## 3. GitHub token

Create a fine-grained PAT with access only to the repositories that should accept generated assets.

Minimum required repository permission:

- Contents: Read and write
- Metadata: Read

Do not paste the token into source code.

In Apps Script > Project Settings > Script Properties, set:

```text
GITHUB_TOKEN=<fine-grained PAT>
ALLOWED_REPOS=m-shogo/minefa,m-shogo/another-repo
```

## 4. First authorization

Run `processQueue()` once manually from the Apps Script editor and approve the requested Google permissions.

No GitHub upload happens if the queue is empty.

## 5. Install the schedule

Run once:

```text
install30MinuteTrigger()
```

This removes previous `processQueue` triggers and creates exactly one 30-minute trigger.

## 6. First proof test

Use a new path that does not overwrite an existing asset.

1. Put one image and one `manifest.json` into a task folder under `incoming`.
2. Calculate and record the source SHA-256 in the manifest.
3. Run `processQueue()` manually for the first proof.
4. Confirm the file exists in the requested GitHub repo/branch/path.
5. Confirm the Drive task folder was deleted only after GitHub read-back SHA-256 matched.
6. If it fails, inspect `failed/<task>` and `error.json`.

After the proof passes, rely on the 30-minute trigger.
