# Operations

## Normal flow

```text
ChatGPT image generation / Figma export / other asset
  ↓
Drive incoming/<repo>/<branch>/<task>
  ├─ image
  └─ manifest.json
  ↓
TASK FOLDER RE-READ
  ↓
image + manifest.json の両方がDrive上に実在することを確認
  ↓
初めて「queue投入完了」
  ↓
5-minute GAS trigger
  ↓
processing/<repo>/<branch>/<task>
  ↓
manifest validation
  ↓
repo allowlist + repo visibility + branch existence check
  ↓
source size + SHA-256 check
  ↓
GitHub upload
  ↓
GitHub raw read-back
  ↓
SHA-256 match
  ↓
Drive task folder permanently deleted
  ↓
empty branch/repo folders cleaned up
```

## HARD GATE — manifest確認を絶対に省略しない

このbridgeで最も忘れやすい運用ミスは、**画像だけDriveへuploadし、`manifest.json` のuploadを忘れること**。

GASは `manifest.json` があるfolderだけをtaskとして認識するため、画像だけでは配送されない。

したがって、ChatGPT/agent側は次を必須手順とする。

```text
1. 画像をDriveへupload
2. manifest.jsonを生成
3. manifest.jsonを同じtask folderへupload
4. task folderをDriveから再読込
5. source imageが存在することを確認
6. manifest.jsonが存在することを確認
7. 両方確認できた場合だけ「Drive投入完了」と報告
```

**ローカルにmanifestを作っただけでは未完了。Drive上に実在して初めて完了。**

この確認は、急いでいる場合・連続画像生成中・複数task投入中でも省略しない。

## Completion contract

以下を満たすまで成功報告しない。

### Queue投入完了

- source image: Drive上に実在
- `manifest.json`: 同じtask folderに実在
- manifestの `sourceFile` と実画像名が一致

### 自動化セットアップ完了

- `install5MinuteTrigger()` を実行
- Apps ScriptのTrigger一覧で `processQueue / time-driven / every 5 minutes` が実在

### 配送成功

- GitHubの指定repo / branch / pathにassetが存在
- GitHub raw read-back SHA-256 == source SHA-256
- 成功taskがDriveから削除
- `incoming` / `processing` に成功task由来の空branch/repo folderが残らない

## Failure flow

Persistent failures move the entire task folder to the same human-readable hierarchy under `failed`.

```text
failed/
└─ <repo>/
   └─ <branch-safe-name>/
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
- repo not allowed / repo not visible to token
- branch missing
- source SHA mismatch
- source larger than the v1 safety limit
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

All three statuses use `repo / branch / task` for visibility. The bridge recursively discovers folders containing `manifest.json`.

The folder hierarchy is not authoritative. The manifest remains the source of truth for the actual repo and branch.

## Capacity policy

Current v1 limits:

- maximum 10 tasks per execution
- maximum 10 MiB per source asset
- standard trigger interval: 5 minutes

The 10 MiB file limit is intentionally conservative because the GitHub Contents API request contains base64, which increases payload size, and Apps Script also has execution/runtime constraints.

If many images accumulate, later 5-minute runs continue the queue.

Larger artifacts should not silently bypass the limit. They belong in a future transport strategy or explicit large-file workflow.

## Cleanup policy

Successful tasks: delete immediately after GitHub read-back SHA match, then remove empty branch/repo folders.

Failed tasks: retain until repaired or manually deleted. v1 does not automatically destroy failed source images.

## What humans normally do

Normally nothing after a **verified complete task** has been placed in `incoming`.

The agent creating the task must first verify image + manifest presence. Only inspect `failed` when a transfer does not complete.
