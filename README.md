# chatgtp-image-to-git

画像ファイルを Google Drive の一時配送キューへ置き、Google Apps Script (GAS) が対象 GitHub repo / branch / path へ安全に配送するための**実装・仕様・検証・学習の正本repo**です。

> 名前は `chatgtp-image-to-git` ですが、**ChatGPT生成画像専用ではありません。**
> Figmaから書き出した画像、Webで調べて取得した参考画像、自作画像、他の画像生成ツールの出力なども、権利・利用条件を確認したうえで同じDrive配送経路を使えます。
>
> このrepo自体は画像置き場ではありません。画像本体の最終正本は配送先Git repoです。

## 🚀 最初にやること

詳細手順: [`docs/SETUP.md`](docs/SETUP.md)

### 開くURL

- Google Apps Script: https://script.google.com/
- GitHub Fine-grained PAT設定: https://github.com/settings/personal-access-tokens
- このrepoのGAS正本: [`gas/Code.gs`](gas/Code.gs)
- Apps Script manifest正本: [`gas/appsscript.json`](gas/appsscript.json)

### 設定順序

```text
1. GitHub Fine-grained PATを作る
2. https://script.google.com/ を開いてNew project
3. Apps Scriptの Code.gs に、このrepoの gas/Code.gs を全コピペ
4. Project Settingsで appsscript.json 表示をON
5. Apps Scriptの appsscript.json に、このrepoの gas/appsscript.json を全コピペ
6. Project Settings → Script Properties に2項目を登録
7. processQueue() を1回RunしてGoogle認可
8. install30MinuteTrigger() を1回Run
9. first-proofで実画像E2Eテスト
```

### Script Properties

Apps Script左側 **Project Settings（歯車）→ Script Properties → Add script property**。

```text
Property: GITHUB_TOKEN
Value:    GitHubで作ったFine-grained PAT

Property: ALLOWED_REPOS
Value:    m-shogo/minefa
```

複数repoならカンマ区切り:

```text
m-shogo/minefa,m-shogo/vamp-pon,m-shogo/wedding-project
```

**PATはCode.gs、manifest.json、Git repoへ絶対に書かない。**

現在のDrive folder IDは `gas/Code.gs` に設定済みなので、Driveフォルダを作り直さない限り変更不要です。

---

## 何の画像を送れる？

### ChatGPT生成画像

生成した原本をDriveへ置きます。再生成で完全同一画像になる保証はないため、再生成を復旧手段にしません。

### Figma export画像

PNG / JPG / WebP等をFigmaからexportして同じincomingへ置けます。

注意:
- 編集可能なFigmaデザインが必要なら、PNGだけをデザイン正本にしない。Figma側が正本、Git画像はexport artifactとして扱う。
- export倍率（1x / 2x等）、format、透過、cropを意図的に決める。
- 再exportでbytesが変わったらSHA-256も作り直す。
- 既存path差し替えは `overwrite=true` を意図的に指定。通常はfalse。

### Webで調べて取得した画像・参考画像

技術的には同じ経路で配送できます。ただし**「ダウンロードできる = Gitへ保存・再配布してよい」ではありません。**

Gitへ入れる前に確認:
- 著作権・ライセンス・利用規約
- 商用利用可否
- 改変可否
- クレジット/帰属表示の要否
- 再配布可否
- 人物写真の肖像・プライバシー
- ロゴ・キャラクター等の商標・第三者権利

権利不明の画像は製品assetとして恒久保存せず、原則参考資料として扱います。必要ならmanifestの `purpose` に `reference-only` 等を残します。

### その他

Photoshop / Illustrator / Canva等のexport、自分で撮影した写真、他の画像生成サービス、スクリーンショット、QA比較画像なども同じ経路を使えます。元サービスの利用規約・権利条件を優先します。

---

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

例:

```text
incoming/
└─ minefa/
   └─ feature__top-redesign/
      └─ top-bg-001/
         ├─ evening-station.png
         └─ manifest.json
```

`incoming` = 配送待ち、`processing` = GAS処理中、`failed` = 失敗証拠です。

Driveのrepo / branchフォルダは人間向け整理。**実際の配送先はmanifest.jsonが正本**です。

## manifest.json = 送り状

画像と同じtaskフォルダへ置きます。

```json
{
  "version": 1,
  "taskId": "top-bg-001",
  "repo": "m-shogo/minefa",
  "branch": "feature/top-redesign",
  "path": "src/assets/generated/top/evening-station.png",
  "sourceFile": "evening-station.png",
  "sha256": "2a91eab2b575bed316571ec067d4f055bdcef9f8970c23444f6876eb26604671",
  "overwrite": false,
  "purpose": "TOP画面用の夕景背景",
  "createdBy": "chatgpt-image"
}
```

正式schema: [`schema/manifest.schema.json`](schema/manifest.schema.json)  
コピー用: [`examples/manifest.copy-paste.template.json`](examples/manifest.copy-paste.template.json)

`createdBy` は追跡用に `chatgpt-image` / `figma-export` / `manual` 等を使えます。

---

## GASの中身はどこ？どこへ書く？

### 1. Apps Scriptを開く

https://script.google.com/

**New project** を作成。名前は `ChatGPT Git Bridge` などでOKです。

### 2. Code.gs

Apps Script editor左側:

```text
Files
└─ Code.gs
```

最初からある `myFunction()` 等を全部削除し、このrepoの [`gas/Code.gs`](gas/Code.gs) を**全コピペ**します。

先頭にはDrive folder ID等があります。

```javascript
const CONFIG = {
  incomingFolderId: '1fCCE6FNjazA5ZOtgTGyuh2nRaZueAOfz',
  processingFolderId: '1QMZEBaeb9dcmUoH0HXaALRhW2WZy_w3z',
  failedFolderId: '16R0HPmmaXq_fnzIyqv5ggtaqFERh_ueh',
  maxTasksPerRun: 10,
  maxRetries: 3,
  maxSourceBytes: 10 * 1024 * 1024,
};
```

今のDriveを使う限り変更不要です。

### 3. appsscript.json

Apps Scriptの **Project Settings → Show `appsscript.json` manifest file in editor** をON。

```text
Files
├─ Code.gs
└─ appsscript.json
```

表示された `appsscript.json` を、このrepoの [`gas/appsscript.json`](gas/appsscript.json) で全置換します。

### 4. SecretはScript Properties

**Project Settings → Script Properties**:

```text
GITHUB_TOKEN = <Fine-grained PAT>
ALLOWED_REPOS = m-shogo/minefa
```

### 5. 初回実行

function selectorから `processQueue` → **Run** → Google認可。

次に `install30MinuteTrigger` → **Run**。

以後30分ごとに自動処理されます。

---

## 配送処理

```text
画像 + manifestをincomingへ置く
↓
processingへ移動
↓
manifest検証
↓
repo allowlist / branch存在 / source SHA-256確認
↓
GitHubへupload
↓
GitHubからraw bytesをread-back
↓
SHA-256完全一致
↓
成功ならDrive taskを画像+manifestごと削除
```

HTTP 2xxだけでは成功扱いにしません。

### 失敗

```text
failed/<repo>/<branch>/<task>/
├─ image.png
├─ manifest.json
└─ error.json
```

原本は消しません。一時障害のみ最大3回retryします。

---

## Safety rules

- Git保存確認前にDrive原本を削除しない。
- GitHub read-back SHA-256一致で初めて成功。
- 同一path・同一SHAは重複commitしない。
- 同一path・別SHAは `overwrite=true` なしでは上書きしない。
- 指定branchがなければ失敗。main/masterへ勝手に逃がさない。
- `ALLOWED_REPOS` 外へ送らない。
- PATをGit・Code.gs・manifestへ保存しない。
- GAS多重実行はLockServiceで防ぐ。
- 永続エラーはfailedへ残す。
- v1は1asset 10 MiB上限。
- 外部取得画像は権利・ライセンス確認後に恒久保存する。

---

## 普段の使い方

```text
ChatGPT / Figma / Web / 手元などで画像を用意
↓
Drive incomingへ画像 + manifest
↓
最大約30分
↓
GASがGitへ配送
↓
SHA検証
↓
成功ならDriveから自動削除
```

ChatGPT生成画像は可能な範囲でChatGPT側がDrive退避とmanifest作成まで担当します。Figma exportや手元の画像を自分で置く場合は、画像とmanifestを同じtaskへ置きます。

---

## Current verification status

| Test | Status |
|---|---|
| ChatGPT生成画像を後続ターンで実ファイル取得 | PASS |
| ChatGPT → Drive 原本PNG保存 | PASS |
| Driveから同じbytesを再取得 | PASS |
| ChatGPT → GitHub binary blob（小さい画像） | PASS |
| Git blob SHA完全一致 | PASS |
| 再生成で完全同一画像を復元 | FAIL / 非保証 |
| promptだけで1回に複数独立画像file生成 | FAIL / 現状非保証 |
| Bridge source/schema/docs preflight | CI導入済み |
| Drive → GAS → GitHub 本番サイズPNG | **SETUP後の最終実証待ち** |

詳細: [`docs/SETUP.md`](docs/SETUP.md) / [`docs/TESTING.md`](docs/TESTING.md) / [`docs/EXPERIMENTS.md`](docs/EXPERIMENTS.md)

## Evolution policy

このrepoの目的はGASを守ることではありません。**画像 → Gitを最も安全・低コスト・低手間で実現する方法を育てること**です。

将来、ChatGPT/GitHubのbinary file handoff、Drive→Gitのより単純なnative連携、複数独立画像の一括生成などが改善されたら再評価します。実験結果は `docs/EXPERIMENTS.md`、採否理由は `docs/DECISIONS.md` に残し、明確に優れる場合だけCurrent bestを置き換えます。

### 覚え方

**画像の出所 = どこでもよい（権利確認は必要）**  
**Drive = 配送待ち**  
**GAS = 配送業者**  
**Git = 最終倉庫**
