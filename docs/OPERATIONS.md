# Operations

## Normal flow

```text
ChatGPT image generation
  ↓
Drive incoming/<repo>/<branch>/<task>
  ↓
30-minute GAS trigger
  ↓
processing
  ↓
manifest validation
  ↓
repo allowlist + branch existence check
  ↓
source SHA-256 check
  ↓
GitHub upload
  ↓
GitHub raw read-back
  ↓
SHA-256 match
  ↓
Drive task folder permanently deleted
```

Both the image and `manifest.json` disappear because the entire task folder is deleted only after verification succeeds.

## Failure flow

Persistent failures move the entire task folder to `failed`.

```text
failed/
└─ <task-id>/
   ├─ image.png
   ├─ manifest.json
   └─ error.json
```

The source image is never deleted on failure.

## Retry policy

Retry only errors likely to recover automatically:

- HTTP 408
- HTTP 429
- HTTP 5xx
- Apps Script timeout / quota-like transient errors

Maximum: 3 attempts.

Do not retry automatically:

- invalid manifest
- repo not allowed
- branch missing
- source SHA mismatch
- same path containing different bytes when `overwrite=false`

## Idempotency

Before upload, if the destination path exists:

- same SHA-256 -> success, no commit
- different SHA-256 + `overwrite=false` -> fail
- different SHA-256 + `overwrite=true` -> replace

This prevents duplicate commits when a task is replayed after a crash.

## Branch safety

The branch in the manifest is authoritative.

If the branch no longer exists, the task fails. The bridge must never silently redirect an image to the repository default branch.

## Drive folders

- `incoming`: waiting work
- `processing`: work claimed by the bridge
- `failed`: human attention required

The `repo / branch / task` hierarchy inside `incoming` is for visibility only. The bridge recursively discovers folders containing `manifest.json`.

## Capacity policy

Current v1 limits one execution to 10 tasks. This is intentionally conservative because Apps Script executions have runtime and UrlFetch quotas.

If many images accumulate, later 30-minute runs continue the queue.

## Cleanup policy

Successful tasks: delete immediately after GitHub read-back SHA match.

Failed tasks: retain until repaired or manually deleted. A future version may add age-based cleanup, but v1 does not automatically destroy failed source images.

## What humans normally do

Normally nothing after a task has been placed in `incoming`.

Only inspect `failed` when a transfer does not complete.
