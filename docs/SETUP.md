# Setup — 帰宅後これだけやれば使える

このページは **上から順番に進めればセットアップが終わる** 手順書です。

現在のDriveフォルダはすでに作成済みです。作り直す必要はありません。

## 完了までの順序

```text
1. GitHub PATを作る
2. Apps Scriptを新規作成
3. Code.gsを貼る
4. appsscript.jsonを貼る
5. Script Propertiesを2個設定
6. processQueue()を1回実行してGoogle認可
7. install30MinuteTrigger()を1回実行
8. テスト画像をincomingへ置く
9. processQueue()を手動実行してE2E確認
10. PASSしたら以後は30分ごとに自動
```

---

## 0. すでに準備済み — Google Drive

マイドライブ直下に次が作成済みです。

```text
ChatGPT-Git-Bridge/
├─ incoming/
├─ processing/
└─ failed/
```

現在のfolder ID:

```text
ROOT       = 1TPg9sXKN8je9mwBE2_xv3mRQzFaM2WOp
INCOMING   = 1fCCE6FNjazA5ZOtgTGyuh2nRaZueAOfz
PROCESSING = 1QMZEBaeb9dcmUoH0HXaALRhW2WZy_w3z
FAILED     = 16R0HPmmaXq_fnzIyqv5ggtaqFERh_ueh
```

現在の `gas/Code.gs` にはこのIDを設定済みなので、**ここは変更不要**です。

通常のtask配置:

```text
incoming/
└─ minefa/
   └─ <branch-safe-name>/
      └─ <task-id>/
         ├─ image.png
         └─ manifest.json
```

例: Git branchが `feature/top-redesign` ならDrive上の見やすいフォルダ名は `feature__top-redesign` でOKです。実際のbranchはmanifestの `branch` が正本です。

---

## 1. GitHub Fine-grained PATを作る

GitHubの Fine-grained personal access token を1個作ります。

### Repository access

最初はテスト対象だけに絞るのがおすすめです。

```text
Only select repositories
→ m-shogo/minefa
```

後から対象repoを増やせます。

### Repository permissions

最低限:

```text
Contents: Read and write
Metadata: Read
```

作成後に表示されるtokenをコピーします。

> tokenはGitにもApps Scriptのソースコードにも書かないでください。次のScript Propertiesにだけ保存します。

---

## 2. Google Apps Scriptを作る

Google Apps Scriptで **新しいスタンドアロンプロジェクトを1個** 作ります。

おすすめプロジェクト名:

```text
ChatGPT Git Bridge
```

---

## 3. Code.gsを貼る

このrepoの [`gas/Code.gs`](../gas/Code.gs) を全部コピーして、Apps Script側の `Code.gs` を**全置換**します。

### 基本的に変更する場所

**ありません。**

Drive folder ID、30分trigger、10MiB上限などは現在の運用値を設定済みです。

Driveフォルダを将来作り直した場合だけ、ファイル先頭のここを変更します。

```javascript
const CONFIG = {
  incomingFolderId: 'ここだけ変更',
  processingFolderId: 'ここだけ変更',
  failedFolderId: 'ここだけ変更',
  maxTasksPerRun: 10,
  maxSourceBytes: 10 * 1024 * 1024,
  maxRetries: 3,
};
```

---

## 4. appsscript.jsonを貼る

このrepoの [`gas/appsscript.json`](../gas/appsscript.json) をApps Scriptプロジェクトのmanifestへ反映します。

Apps Scriptでmanifestファイルが見えない場合:

```text
Project Settings
→ Show "appsscript.json" manifest file in editor
```

をONにしてから `appsscript.json` を全置換します。

---

## 5. Script Propertiesを設定する — ここだけ自分の値

Apps Script:

```text
Project Settings
→ Script Properties
→ Add script property
```

### 1個目

```text
Property: GITHUB_TOKEN
Value:    さっき作ったFine-grained PAT
```

### 2個目

最初に `minefa` だけ使うなら、そのままこれです。

```text
Property: ALLOWED_REPOS
Value:    m-shogo/minefa
```

複数repoを許可するときだけカンマ区切りにします。

```text
m-shogo/minefa,m-shogo/vamp-pon,m-shogo/wedding-project
```

### 絶対に変更しないこと

```text
GITHUB_TOKENをCode.gsへ直書きしない
```

---

## 6. Googleの初回認可

Apps Script editor上部のfunction選択で:

```text
processQueue
```

を選んで **Run**。

Googleから権限確認が出るので許可します。

queueが空ならGitHubには何も書き込みません。

この段階でエラーになった場合は、先にエラーを解決してから次へ進みます。

---

## 7. 30分triggerを作る

function選択を:

```text
install30MinuteTrigger
```

にして **Run** を1回だけ実行します。

これで `processQueue()` が30分ごとに自動実行されます。

この関数は既存の `processQueue` triggerを消してから1個だけ作るため、間違えて再実行してもtriggerが増殖しません。

---

## 8. 最初のテストtaskを作る

最初は自動triggerを待たず、手動でE2Eテストします。

Drive:

```text
ChatGPT-Git-Bridge/
└─ incoming/
   └─ minefa/
      └─ so/
         └─ first-proof/
            ├─ image.png
            └─ manifest.json
```

`manifest.json` は [`examples/manifest.v1.example.json`](../examples/manifest.v1.example.json) をコピーして使います。

### ここだけ変更

```json
{
  "version": 1,
  "taskId": "first-proof",
  "repo": "m-shogo/minefa",
  "branch": "so",
  "path": "YOUR_REAL_TARGET_PATH/image.png",
  "sourceFile": "image.png",
  "sha256": "IMAGE_SHA256_HERE",
  "overwrite": false,
  "purpose": "Drive to Git first proof",
  "createdBy": "chatgpt-image"
}
```

変更するのは基本:

```text
branch
path
sourceFile
sha256
```

です。

> `path` は既存画像を壊さない新規pathを使ってください。

通常運用では、このmanifest作成はChatGPT側で行う想定なので、毎回あなたがJSONを書く必要はありません。

---

## 9. 最初のE2Eテスト

Apps Scriptからもう一度:

```text
processQueue()
```

を手動実行します。

### PASS条件

全部満たしたら成功です。

```text
[ ] taskがincomingから処理された
[ ] 指定repo / branch / pathに画像が存在する
[ ] GitHub read-back SHA-256が元画像と一致した
[ ] 成功後、Driveのtask folderが画像+manifestごと消えた
[ ] failedにtaskが残っていない
```

成功後は30分triggerへ任せます。

---

## 10. 以後の通常運用

あなたが普段やる設定作業はありません。

```text
ChatGPTで画像生成
↓
ChatGPTがDrive/incomingへ画像 + manifestを配置
↓
最大約30分
↓
GASがGitHubへ転送
↓
GitHubからread-backしてSHA確認
↓
成功: Drive taskを削除
失敗: failedへ保存
```

見る必要があるのは、転送されなかった時の `failed` だけです。

---

# よくある変更

## 対象repoを追加したい

### 1. GitHub PAT

Fine-grained PATのRepository accessに対象repoを追加。

### 2. Script Properties

`ALLOWED_REPOS`にも追加。

```text
m-shogo/minefa,m-shogo/new-project
```

**両方必要**です。

## Driveフォルダを変更したい

`Code.gs` 先頭の3つのfolder IDだけ変更します。

```javascript
incomingFolderId: '...'
processingFolderId: '...'
failedFolderId: '...'
```

## 30分以外にしたい

`install30MinuteTrigger()` を変更します。ただし現行の推奨値は30分です。

## 10MiBを超える画像を扱いたい

v1では自動的に拒否します。上限を安易に上げず、GAS / GitHub API / repo肥大化への影響を検証してから変更します。

---

# 困ったとき

### 画像がGitに来ない

まずDriveの:

```text
ChatGPT-Git-Bridge/failed/
```

を確認します。

`error.json` に理由が残ります。

### よくあるエラー

```text
REPO_NOT_ALLOWED
→ ALLOWED_REPOS またはPATのRepository accessを確認

BRANCH_NOT_FOUND
→ manifestのbranch名を確認

SOURCE_SHA_MISMATCH
→ manifestのsha256と画像が一致していない

PATH_CONFLICT
→ 同じpathに別画像がある。勝手には上書きしない

SOURCE_TOO_LARGE
→ 10MiB上限を超えている

CONFIG_MISSING: GITHUB_TOKEN
→ Script PropertiesのGITHUB_TOKENが未設定
```

エラー時に元画像は削除されません。

---

# セットアップ完了チェック

```text
[ ] Fine-grained PAT作成
[ ] Apps Script project作成
[ ] Code.gs貼り付け
[ ] appsscript.json貼り付け
[ ] GITHUB_TOKEN設定
[ ] ALLOWED_REPOS設定
[ ] processQueue()初回認可
[ ] install30MinuteTrigger()実行
[ ] first-proof PASS
```

ここまで終わればセットアップ完了です。