# chatgtp-image-to-git

ChatGPTで生成した画像を、Codex / Work の利用枠やコンテキストをなるべく消費せず、Google Drive を一時配送キューとして対象GitHub repoへ安全に届けるための**実装・仕様・検証・学習の正本repo**です。

> このrepoは画像置き場ではありません。
> 画像本体は最終的な対象repoへ保存し、このrepoには橋渡しの仕組み、判断、失敗、改善履歴を残します。

## 🚀 初めて設定する人はここだけ

**[`docs/SETUP.md`](docs/SETUP.md) を上から順番に進めてください。**

Driveフォルダはすでに作成済み、`Code.gs` も現在のfolder ID設定済みです。

自分で入力する値は基本この2つだけです。

```text
GITHUB_TOKEN = 自分のFine-grained PAT
ALLOWED_REPOS = m-shogo/minefa
```

コピー用テンプレート:

- [`examples/script-properties.template.txt`](examples/script-properties.template.txt)
- [`examples/manifest.copy-paste.template.json`](examples/manifest.copy-paste.template.json)

セットアップ順序:

```text
PAT作成
→ Apps Script作成
→ Code.gs貼る
→ appsscript.json貼る
→ Script Properties 2個設定
→ processQueue()初回認可
→ install30MinuteTrigger()
→ first-proof
→ 完了
```

---

## Current best — 2026-08-11

```text
ChatGPT Images
  ↓
Google Drive / ChatGPT-Git-Bridge / incoming
  ↓
image + manifest.json
  ↓
Google Apps Script（30分ごと）
  ↓
repo allowlist / branch existence / size / SHA-256検証
  ↓
GitHub Contents API
  ↓
対象repo / 対象branch / 指定path
  ↓
GitHubからraw bytesをread-back
  ↓
SHA-256完全一致
  ↓
Drive task folderを永久削除
```

### なぜ今はこの方式か

- ChatGPTで生成した画像は後続ターンでも実ファイルとして取得できることを実証済み。
- ChatGPT → Google Drive は元PNGをそのまま保存できることを実証済み。
- 小さい画像はChatGPT → GitHub binary blobまで直接転送できることを実証済み。
- 数MBの画像をChatGPTから巨大base64として直接GitHub connectorへ流すのは非効率。
- Driveを一時キューにすれば、ChatGPT側は画像を退避した時点で次の制作へ進める。
- GASが大容量binaryのGitHub転送を担当するため、通常ChatGPTのコンテキストを圧迫しにくい。

## Drive layout

```text
ChatGPT-Git-Bridge/
├─ incoming/
│  └─ <repo>/
│     └─ <branch-safe-name>/
│        └─ <task-id>/
│           ├─ image.png
│           └─ manifest.json
├─ processing/
│  └─ <repo>/
│     └─ <branch-safe-name>/
└─ failed/
   └─ <repo>/
      └─ <branch-safe-name>/
```

例:

```text
incoming/
└─ minefa/
   └─ feature__top-redesign/
      └─ 20260811-top-bg-001/
         ├─ evening-station.png
         └─ manifest.json
```

Driveの `repo / branch / task` 階層は**人間向け整理**です。配送先の正本は必ず `manifest.json` です。

Git branch `feature/top-redesign` はDriveでは `feature__top-redesign` のように安全な表示名へ変えて構いません。manifestには本物のbranch名を記録します。

## Manifest

manifestは画像の「送り状」です。

```json
{
  "version": 1,
  "taskId": "20260811-minefa-feature-top-redesign-bg-001",
  "repo": "m-shogo/minefa",
  "branch": "feature/top-redesign",
  "path": "src/assets/generated/top/evening-station.png",
  "sourceFile": "evening-station.png",
  "sha256": "2a91eab2b575bed316571ec067d4f055bdcef9f8970c23444f6876eb26604671",
  "overwrite": false,
  "purpose": "TOP画面用の夕景背景",
  "createdBy": "chatgpt-image",
  "createdAt": "2026-08-11T20:40:00+09:00"
}
```

正式schema: [`schema/manifest.schema.json`](schema/manifest.schema.json)

## Safety invariants

このbridgeは次を破ってはいけません。

- Driveは一時配送キュー。採用済みassetの正本はGit。
- Gitへの保存確認前にDrive原本を削除しない。
- HTTP 2xxだけでは成功扱いにしない。
- GitHubからread-backしたbytesのSHA-256がDrive原本と完全一致して初めて成功。
- 同一path・同一SHAは冪等成功として重複commitしない。
- 同一path・別SHAは `overwrite=true` なしでは上書きしない。
- manifestで指定されたbranchが存在しなければ失敗。default branchへ勝手に逃がさない。
- `ALLOWED_REPOS` にないrepoへ送らない。
- GitHub tokenをソースコードへ保存しない。
- GASの多重実行は `LockService` で止める。
- 一時障害だけ限定回数retryする。
- 永続エラーではDrive原本を消さず `failed` に残す。
- v1では1asset 10 MiBを安全上限とし、大きいファイルを黙って処理しない。

## Success / failure

### Success

```text
incoming/<repo>/<branch>/<task>
  ↓
processing/<repo>/<branch>/<task>
  ↓
GitHub upload
  ↓
GitHub read-back
  ↓
SHA-256 MATCH
  ↓
Drive task folderを永久削除
```

画像だけでなく `manifest.json` もtaskフォルダごと消えます。

### Failure

```text
failed/
└─ <repo>/
   └─ <branch-safe-name>/
      └─ <task-id>/
         ├─ image.png
         ├─ manifest.json
         └─ error.json
```

失敗時は原本を削除しません。

## Repository structure

```text
.
├─ README.md
├─ gas/
│  ├─ Code.gs
│  └─ appsscript.json
├─ schema/
│  └─ manifest.schema.json
├─ examples/
│  ├─ manifest.v1.example.json
│  ├─ manifest.copy-paste.template.json
│  └─ script-properties.template.txt
├─ scripts/
│  └─ preflight.mjs
├─ .github/workflows/
│  └─ ci.yml
└─ docs/
   ├─ SETUP.md
   ├─ OPERATIONS.md
   ├─ TESTING.md
   ├─ DECISIONS.md
   ├─ EXPERIMENTS.md
   └─ ROADMAP.md
```

- `README.md`: 現在の正解と入口
- `gas/`: 現行bridge実装
- `schema/`: machine-readableな契約
- `examples/`: コピペ用設定・task作成例
- `scripts/preflight.mjs`: schema・example・GASの最低契約を依存なしで検査
- `.github/workflows/ci.yml`: push / PRごとのpreflight + GAS JavaScript構文検査
- `SETUP.md`: **初回はここだけ読めばよい設定手順**
- `OPERATIONS.md`: 成功・失敗・retry・削除ルール
- `TESTING.md`: 実証済みと未実証を分ける検証表
- `DECISIONS.md`: なぜそう設計したか
- `EXPERIMENTS.md`: 実際に試した結果。成功も失敗も残す
- `ROADMAP.md`: 次に改善すること、現方式を捨てる条件

## Current verification status

| Test | Status |
|---|---|
| ChatGPT生成画像を後続ターンで実ファイル取得 | PASS |
| ChatGPT → Drive 原本PNG保存 | PASS |
| Driveから同じbytesを再取得 | PASS |
| ChatGPT → GitHub binary blob（小さい画像） | PASS |
| Git blob SHA完全一致 | PASS |
| 再生成で完全同一画像を復元 | FAIL / 非保証 |
| 巨大base64をChatGPT connectorから直接転送 | 非推奨 |
| Bridge source/schema/docs preflight | CI導入済み |
| Drive → GAS → GitHub 本番サイズPNG | **SETUP後の最終実証待ち** |

「実証済み」と「設計上できる」を混同しないこと。

詳細な検証表: [`docs/TESTING.md`](docs/TESTING.md)

## Evolution policy

このrepoの目的はGASを守ることではありません。**画像生成→Gitを最も安全・低コスト・低手間で実現する方法を育てること**です。

次のような機能が利用可能になった場合は再評価します。

- GitHub connectorが `file_uri` / binary file uploadを直接受け取る
- ChatGPTが生成ファイルを任意のconnectorへ直接受け渡せる
- Drive → GitHubの安全なnative連携が追加される
- GASより無料・安全・手間なしの方法が利用可能になる

方式を変えるときは:

1. `docs/EXPERIMENTS.md` に実測結果を残す。
2. `docs/DECISIONS.md` に採否理由を残す。
3. `docs/ROADMAP.md` を更新する。
4. 最後にREADMEの `Current best` を更新する。

古い方式を惰性で残さない。

## Principle

**Driveは配送トラック。Gitが倉庫。**

配送完了をbytesで確認できるまでは荷物を捨てない。
