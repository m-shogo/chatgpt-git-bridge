# Experiments

実験事実を残す。推測と混ぜない。

## EXP-001〜006 — 基礎検証

2026-08-11〜12に以下を確認した。

- ChatGPT生成画像は後続ターンで元の実ファイルとして取得可能: PASS
- ChatGPT → Google Drive raw PNG handoff: PASS
- ChatGPT → GitHub binary blob（小画像）: PASS
- 再生成によるexact reproduction: FAIL / 非保証
- GitHub Actions base64 reconstruction bridge: NOT ADOPTED
- promptだけで1回に複数独立画像file生成: FAIL / 現状非保証

複数assetは当面 `1 image-generation call = 1 asset` として、生成後にDriveへ退避してから次assetへ進む。

## EXP-007 — Drive → GAS → GitHub full-size PNG

**Date:** 2026-08-12  
**Result:** PASS

- source: 2,778,816 byte PNG
- target repo: `m-shogo/bk_soropon-product`
- branch: `master`
- path: `public/generated/chatgpt-evening-station-proof.png`
- GitHub上に実画像file作成
- GitHubからread-backしてsource SHA-256と照合
- 成功後task原本をDrive queueから削除

### First-run failure

最初はGitHub APIの404を `BRANCH_NOT_FOUND` と誤診した。branch `master` は存在し、実原因はFine-grained PATのRepository access不足だった。

PATを `All repositories` + `Contents: Read and write` に修正し、同じ原本taskを再実行してPASS。

### Learning

- GitHub 404はbranch不存在とは限らない。
- private repoがtokenから見えない場合も404になり得る。
- repo endpointを先に確認し、`REPO_NOT_VISIBLE_TO_TOKEN` と `BRANCH_NOT_FOUND` を分離する。
- failedへ原本を保持したことで再生成せず復旧できた。

## EXP-008 — failure recovery / folder cleanup

**Date:** 2026-08-12  
**Result:** PASS after fix

### Observed issue

`incoming` → `processing` / `failed` へのmove後、元の `incoming/<repo>/<branch>/` が空のまま残った。

### Root cause

旧実装はmove前のsource parent chainを保持していなかった。

### Fix / verification

- move前にsource parent chainをcapture
- move直後に空source branch/repoを削除
- `processQueue()` 最後にincoming / processing全体をbest-effort cleanup
- 実E2E後、incoming / processingが空であることを確認

## EXP-009 — ChatGPT → Drive task completeness

**Date:** 2026-08-12  
**Initial result:** FAIL  
**After fix:** PASS

### Failure

画像をDriveへuploadしたが、`manifest.json` はローカル生成だけでDrive uploadが完了していなかった。にもかかわらずqueue投入完了と誤って報告した。

GASは `manifest.json` が存在するfolderだけをtaskとして認識するため、画像はincomingに残り続けた。

### Prevention

queue投入完了条件を次に固定する。

```text
image upload
↓
manifest upload
↓
task folderを再確認
↓
image + manifest.json の両方がDrive上に実在
↓
初めて「queue投入完了」
```

「ローカルにmanifestを作った」と「Driveへmanifestを置いた」を混同しない。

## EXP-010 — 5-minute trigger installation

**Date:** 2026-08-12  
**Initial result:** FAIL

### Failure

`install5MinuteTrigger()` を実行した前提で進めたが、Apps ScriptのTrigger一覧には実際にはtriggerが存在しなかった。そのためtaskは正しくincomingに存在していても自動処理されなかった。

### Root cause / learning

install関数の実行を「trigger作成成功」と同一視した。外部状態を確認せず成功扱いしたことが問題。

### Prevention

セットアップ完了条件:

```text
install5MinuteTrigger() Run
↓
Apps Script → Triggers
↓
processQueue / time-driven / every 5 minutes が実在
↓
初めてtrigger設定完了
```

## EXP-011 — Fully automatic ChatGPT → Drive → GAS → GitHub E2E

**Date:** 2026-08-12  
**Result:** **PASS**

### Goal

手動 `processQueue()` を使わず、5分triggerだけで完全自動配送できることを実証する。

### Proof asset

```text
repo:   m-shogo/bk_soropon-product
branch: master
path:   public/generated/chatgpt-auto-e2e-proof.png
```

### Verified sequence

```text
ChatGPT asset
↓
Drive incomingへ画像 + manifest.json
↓
人間によるprocessQueue手動実行なし
↓
5分trigger発火
↓
processing
↓
GitHub upload
↓
GitHub raw read-back / SHA verification
↓
Drive task delete
↓
empty branch/repo cleanup
```

### Final observations

- GitHub上に `chatgpt-auto-e2e-proof.png` が存在: PASS
- incoming: empty
- processing: empty
- 成功taskの空branch/repo folder: 残存なし
- manual `processQueue()`: 不使用

### Conclusion

**ChatGPT → Drive → GAS → GitHub のv1は完全自動E2Eとして実用可能。**

ただし以下を運用上のhard gateとする。

1. Drive投入完了 = image + manifestの実在確認まで
2. trigger設定完了 = Trigger一覧で実在確認まで
3. Git成功 = API 2xxではなくread-back SHA一致まで
4. Drive削除 = Git成功後のみ
5. エラー時はfailedに原本を保持

## Error diagnosis contract

```text
ALLOWED_REPOS
↓
repo endpoint
  404 → REPO_NOT_VISIBLE_TO_TOKEN
  401 → GITHUB_TOKEN_INVALID_OR_EXPIRED
  403 → GITHUB_REPO_FORBIDDEN
↓
branch endpoint
  404 → BRANCH_NOT_FOUND
↓
source SHA
↓
asset upload
↓
read-back SHA verification
```

## Trigger decision — 5 minutes

1分triggerもGAS仕様上は可能だが、空queue時の無駄な実行回数が増えるため、現行v1は **5分triggerを標準** とする。

`install5MinuteTrigger()` は既存 `processQueue` triggerを削除してから1つだけ再作成する。

## Remaining experiments

- nonexistent branchが正しく `BRANCH_NOT_FOUND` になる
- tokenから見えないprivate repoが `REPO_NOT_VISIBLE_TO_TOKEN` になる
- same path / different SHA + overwrite=falseが原本保持でfailedへ行く
- expired token
- 429 / temporary GitHub error
- upload成功後・Drive削除前の中断からidempotent復旧
- cleanup API failure

失敗は消さず、再発防止を実装・README・チェックリストへ昇格させる。
