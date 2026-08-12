# ChatGPT-Git-Bridge

画像ファイルを Google Drive の一時配送キューへ置き、Google Apps Script (GAS) が対象 GitHub repo / branch / path へ安全に配送するための**実装・仕様・検証・学習の正本repo**です。

> ChatGPT生成画像専用ではありません。Figma export、自作画像、権利確認済みの参考画像、他の画像生成ツールの出力なども同じ配送経路を使えます。
>
> このrepo自体は画像置き場ではありません。画像本体の最終正本は配送先Git repoです。

## Current best — verified 2026-08-12

```text
画像を用意
↓
Drive incoming/<repo>/<branch>/<task>/ に画像 + manifest.json
↓
5分triggerで processQueue() 自動実行
↓
processingへ移動
↓
manifest / allowlist / repo / branch / source SHA検証
↓
GitHubへ保存
↓
GitHubからraw bytesをread-back
↓
SHA-256完全一致
↓
Drive taskを削除
↓
空branch / repo folderも削除
```

**完全自動E2E PASS済み。** 手動 `processQueue()` なしで ChatGPT → Drive → GAS 5分trigger → GitHub → read-back検証 → Drive cleanup まで完走しています。

## セットアップ

詳細: [`docs/SETUP.md`](docs/SETUP.md)

1. GitHub Fine-grained PATを作成
2. Apps ScriptでNew project
3. [`gas/Code.gs`](gas/Code.gs) を `Code.gs` へ全コピペ
4. Project Settingsで `appsscript.json` 表示をON
5. [`gas/appsscript.json`](gas/appsscript.json) を全コピペ
6. Script Propertiesを設定
7. `processQueue()` を1回RunしてGoogle認可
8. `install5MinuteTrigger()` を1回Run
9. **Apps Scriptのトリガー画面を開き、`processQueue / 時間主導型 / 5分おき` が実在することを確認**
10. first-proofを流し、Git保存・SHA検証・Drive cleanupを確認

### Script Properties

```text
GITHUB_TOKEN = <Fine-grained PAT>
ALLOWED_REPOS = m-shogo/*
```

PAT側は今回の用途では:

```text
Repository access: All repositories
Repository permissions: Contents = Read and write
```

`ALLOWED_REPOS=m-shogo/*` は「m-shogo配下なら配送を許可する」という安全境界です。実際の配送先repo / branch / pathは各taskの `manifest.json` が指定します。

**PATはCode.gs、manifest.json、Git repoへ絶対に書かない。**

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
└─ failed/
```

- `incoming`: 配送待ち
- `processing`: GAS処理中
- `failed`: 永続失敗の原本・manifest・error.jsonを保持
- 成功時: task削除後、空になったbranch / repo folderも自動削除

Drive階層は人間向け整理で、**配送先の正本はmanifest.json**です。

## manifest.json = 送り状

画像と同じtaskフォルダへ置きます。

```json
{
  "version": 1,
  "taskId": "top-bg-001",
  "repo": "m-shogo/example-project",
  "branch": "feature/top-redesign",
  "path": "src/assets/generated/top/evening-station.png",
  "sourceFile": "evening-station.png",
  "sha256": "<64-char-sha256>",
  "overwrite": false,
  "purpose": "TOP画面用背景",
  "createdBy": "chatgpt-image"
}
```

正式schema: [`schema/manifest.schema.json`](schema/manifest.schema.json)  
コピー用: [`examples/manifest.copy-paste.template.json`](examples/manifest.copy-paste.template.json)

## 何の画像を送れる？

- ChatGPT生成画像: 原本bytesをDriveへ。再生成を復旧手段にしない。
- Figma export: PNG/JPG/WebP等。Figmaが編集正本ならGit画像はexport artifactとして扱う。
- Web/調査画像: 著作権、ライセンス、商用利用、改変、再配布、クレジット、肖像・商標等を確認してから恒久保存。
- Photoshop / Illustrator / Canva / 自分で撮影した写真 / 他画像生成サービス / QA比較画像も利用可能。

## Safety rules

- **画像 + manifest.json の両方がDrive上に実在することを確認して初めてqueue投入完了とする。**
- Git保存確認前にDrive原本を削除しない。
- GitHub read-back SHA-256一致で初めて成功。
- 同一path・同一SHAは重複commitしない。
- 同一path・別SHAは `overwrite=true` なしでは上書きしない。
- 指定branchがなければ失敗。main/masterへ勝手に逃がさない。
- `ALLOWED_REPOS` 外へ送らない。
- PATをGit・Code.gs・manifestへ保存しない。
- GAS多重実行はLockServiceで防ぐ。
- 永続エラーはfailedへ原本を残す。
- v1は1asset 10 MiB上限。
- GitHub 404を即branch不存在と断定しない。repo visibilityを先に確認する。
- trigger install関数をRunしただけで完了扱いにしない。**トリガー一覧で実在確認する。**

## 今回見つかった失敗と再発防止

| Failure | Root cause | Prevention |
|---|---|---|
| private repoへ送れない | Fine-grained PATのRepository access不足 | PAT All repositories + Contents R/W、repo visibilityを先に診断 |
| 404をBRANCH_NOT_FOUNDと誤診 | branch endpointだけで判定 | repo endpoint → branch endpointの順に確認 |
| incomingに空folderが残る | move前parentをcleanupしていなかった | source parent capture + run後status tree cleanup |
| 画像だけDriveへ置かれた | manifest upload完了確認不足 | taskを再読込し画像+manifestの2ファイルを確認 |
| 自動配送されない | 5分triggerが実際には未作成 | Trigger画面で `processQueue / 5分` を実在確認 |

## Current verification status

| Test | Status |
|---|---|
| ChatGPT生成画像を後続ターンで実ファイル取得 | PASS |
| ChatGPT → Drive 原本PNG保存 | PASS |
| Driveから同じbytesを再取得 | PASS |
| Drive → GAS → GitHub 2.78MB PNG | PASS |
| GitHub read-back SHA-256検証 | PASS |
| 成功後Drive task削除 | PASS |
| 成功後の空branch/repo cleanup | PASS |
| **5分triggerのみで完全自動E2E** | **PASS — 2026-08-12** |
| 再生成で完全同一画像を復元 | FAIL / 非保証 |
| promptだけで1回に複数独立画像file生成 | FAIL / 現状非保証 |

完全自動proof:

```text
repo:   m-shogo/bk_soropon-product
branch: master
path:   public/generated/chatgpt-auto-e2e-proof.png
result: PASS
```

詳細な実験履歴: [`docs/EXPERIMENTS.md`](docs/EXPERIMENTS.md)

## Evolution policy

このrepoの目的はGASを守ることではありません。**画像 → Gitを最も安全・低コスト・低手間で実現する方法を育てること**です。

ChatGPT/GitHubのbinary handoff、Drive→Gitのnative連携、複数独立画像生成などが改善されたら再評価します。失敗も `docs/EXPERIMENTS.md` に残し、同じ失敗を繰り返さないよう実装・チェックリストへ反映します。

### 覚え方

**画像の出所 = どこでもよい（権利確認は必要）**  
**Drive = 配送待ち**  
**GAS = 配送業者**  
**Git = 最終倉庫**
