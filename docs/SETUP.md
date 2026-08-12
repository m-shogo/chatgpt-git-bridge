# Setup — 上から順番にやれば使える

このページは初回セットアップ用です。manifestの書き方は [`MANIFEST_GUIDE.md`](MANIFEST_GUIDE.md) を見れば迷わないように分離しています。

## 完了まで

```text
1. GitHub Fine-grained PATを作る
2. Apps Scriptを新規作成
3. gas/Code.gsを貼る
4. gas/appsscript.jsonを貼る
5. Script Propertiesを設定
6. processQueue()を1回実行してGoogle認可
7. install5MinuteTrigger()を1回実行
8. Trigger一覧で processQueue / 5分おき が実在することを確認
9. テストtaskへ画像 + manifest.jsonを置く
10. taskを再確認し、画像 + manifestの両方が実在することを確認
11. 自動triggerだけでGitへ届くことを確認
```

## Drive

```text
ChatGPT-Git-Bridge/
├─ incoming/
├─ processing/
└─ failed/
```

通常task:

```text
incoming/
└─ <repo>/
   └─ <branch-safe-name>/
      └─ <task-id>/
         ├─ image.png
         └─ manifest.json
```

Driveのrepo/branch名は整理用です。実配送先はmanifestが正本です。

## GitHub PAT

今回の `m-shogo/*` 運用:

```text
Repository access: All repositories
Repository permissions: Contents = Read and write
```

PATはGit、Code.gs、manifestへ書かず、Apps ScriptのScript Propertiesだけに保存します。

## Apps Script

1. Apps Scriptでstandalone projectを作成
2. [`../gas/Code.gs`](../gas/Code.gs) を `Code.gs` へ全置換
3. Project Settings → Show `appsscript.json` manifest file in editor をON
4. [`../gas/appsscript.json`](../gas/appsscript.json) を `appsscript.json` へ全置換

## Script Properties

Project Settings → Script Properties:

```text
GITHUB_TOKEN = <Fine-grained PAT>
ALLOWED_REPOS = m-shogo/*
```

## Google初回認可

function selector:

```text
processQueue
```

→ Run → Google認可。

## 5分trigger

```text
install5MinuteTrigger
```

→ Run。

**ここで終わりではありません。** 左側のTriggersを開き、次が実在することを確認します。

```text
processQueue
時間主導型
分ベース
5分おき
```

実在確認までがセットアップです。

## manifest

毎回一からJSONを考えません。

コピー用:
[`../examples/manifest.copy-paste.template.json`](../examples/manifest.copy-paste.template.json)

詳しい説明:
[`MANIFEST_GUIDE.md`](MANIFEST_GUIDE.md)

基本的に決めるのは:

```text
repo       どのGitHub repo？
branch     どのbranch？
path       Gitのどこへ置く？（ファイル名まで）
sourceFile Drive上の画像名は？
taskId     今回の配送名
```

SHA-256は画像から計算します。手入力しないのが標準です。

## HARD GATE — manifest忘れ防止

```text
画像upload
↓
manifest.json upload
↓
task folderを再確認
↓
画像あり
↓
manifest.jsonあり
↓
初めてqueue投入完了
```

ローカルにmanifestを生成しただけでは未完了です。

## PASS条件

```text
[ ] GitHubの指定repo / branch / pathに画像が存在
[ ] GitHub read-back SHA-256がsourceと一致
[ ] incomingから成功taskが消えた
[ ] processingから成功taskが消えた
[ ] 空branch/repo folderも残っていない
[ ] failedに新しいtaskがない
```

## 通常運用

```text
画像生成 / export
↓
Driveへ画像 + manifest
↓
両方の実在確認
↓
最大約5分
↓
GAS
↓
GitHub
↓
read-back SHA確認
↓
成功ならDrive cleanup
失敗ならfailedへ原本保持
```

## 困ったとき

まず `failed/` の `error.json` を確認します。

代表例:

```text
REPO_NOT_VISIBLE_TO_TOKEN
→ PATのRepository accessを確認

REPO_NOT_ALLOWED
→ ALLOWED_REPOSを確認

BRANCH_NOT_FOUND
→ manifestのbranchを確認

SOURCE_SHA_MISMATCH
→ manifestのsha256と画像bytesが違う

PATH_CONFLICT
→ 同pathに別画像あり。overwrite=falseなら安全停止

SOURCE_TOO_LARGE
→ v1 10MiB上限

CONFIG_MISSING: GITHUB_TOKEN
→ Script Propertiesを確認
```

GitHub 404だけを見てbranch不存在と断定しません。repo visibility → branchの順に診断します。

## セットアップ完了チェック

```text
[ ] PAT: All repositories / Contents R&W
[ ] Apps Script project作成
[ ] Code.gs貼り付け
[ ] appsscript.json貼り付け
[ ] GITHUB_TOKEN設定
[ ] ALLOWED_REPOS=m-shogo/*
[ ] processQueue()初回認可
[ ] install5MinuteTrigger()実行
[ ] Trigger一覧にprocessQueue / 5分が実在
[ ] 画像 + manifestのDrive実在確認
[ ] 自動E2E PASS
```

ここまで終われば通常運用へ入れます。
