# Testing

このrepoでは「設計上できる」と「実証済み」を分ける。

## Preflight checklist

- [x] READMEに現行方式・安全境界・進化方針がある
- [x] GAS実装が専用repoにある
- [x] manifest schemaとGAS必須項目が一致
- [x] `repo / branch / task` のDrive階層を再帰検出できる
- [x] manifestのbranch存在確認を行う
- [x] branch不存在時にdefault branchへフォールバックしない
- [x] repo allowlistを行う
- [x] source SHA-256を送信前に確認する
- [x] 同一path・同一SHAはskipする
- [x] 同一path・別SHAは`overwrite=true`なしで拒否する
- [x] GitHub upload後にraw bytesをread-backする
- [x] read-back SHA-256一致後のみDrive taskを削除する
- [x] 失敗時は画像+manifest+error.jsonを残す
- [x] transient errorのみ最大3回retryする
- [x] LockServiceで多重実行を防ぐ
- [x] 30分trigger installerがある
- [ ] Apps Script projectへ`gas/`を反映
- [ ] fine-grained PATをScript Propertiesへ設定
- [ ] 2.78MB PNGをDrive→GAS→GitHubへ実転送
- [ ] Git側のSHA-256がDrive原本と完全一致
- [ ] 成功後にDrive taskが削除される
- [ ] 同じtaskを再投入して重複commitが発生しない
- [ ] branch不存在taskが`failed`へ移動する
- [ ] 同名別画像が`overwrite=false`で拒否される

## First end-to-end proof

Use the already preserved generated PNG:

- size: `2,778,816 bytes`
- SHA-256: `2a91eab2b575bed316571ec067d4f055bdcef9f8970c23444f6876eb26604671`

Target a new path in a test repository/branch so no existing asset is overwritten.

Success requires all of the following:

1. GAS moves the task from `incoming` to `processing`.
2. GitHub receives the file at the exact manifest path.
3. GAS downloads the GitHub copy again.
4. SHA-256 equals the source SHA above.
5. The Drive task folder, including image and manifest, is permanently deleted.
6. Re-running the queue creates no duplicate commit.

## Failure injection tests

After the first proof, deliberately test:

### Missing branch

Set `branch` to a branch that does not exist.

Expected: task moves to `failed`; no fallback to default branch; source image remains.

### Path conflict

Point a different image at an existing path with `overwrite=false`.

Expected: task moves to `failed`; existing Git asset is unchanged.

### Wrong source SHA

Change one character in `sha256`.

Expected: `SOURCE_SHA_MISMATCH`; no Git write; source remains in Drive.

### Duplicate delivery

Recreate a task whose destination already contains identical bytes.

Expected: idempotent success; no new commit; Drive task is cleaned up.

## Updating this file

Every newly discovered failure mode should become a reproducible test here before changing the production rules.
