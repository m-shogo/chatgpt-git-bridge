# manifest.json — 迷わない実用ガイド

`manifest.json` は **「この画像を、どのGitHub repoの、どのbranchの、どのpathへ送るか」** をGASへ伝える送り状です。

## 結論: 人が毎回JSONを一から書かない

通常運用ではChatGPT側が画像からSHA-256を計算してmanifestを生成します。

人間またはAIが決める情報は、基本この5つだけです。

```text
1. repo       → どのGitHub repo？
2. branch     → どのbranch？
3. path       → Gitのどこへ置く？（ファイル名まで）
4. sourceFile → Driveへ置いた画像の実ファイル名は？
5. taskId     → 今回の配送を識別する名前
```

`purpose` は任意の人間向けメモです。

`sha256` は画像bytesから計算するため、**手入力しない**のが基本です。

`version` は現在 `1` 固定、ChatGPT生成なら `createdBy` は `chatgpt-image` でOKです。

---

## 一番使うテンプレ

> JSONにはコメントを書けないため、説明コメントはこのガイドに置き、実ファイルは純粋なJSONにします。

```json
{
  "version": 1,
  "taskId": "CHANGE_ME_TASK_ID",
  "repo": "m-shogo/CHANGE_ME_REPO",
  "branch": "CHANGE_ME_BRANCH",
  "path": "CHANGE_ME_GIT_PATH/image.png",
  "sourceFile": "CHANGE_ME_IMAGE_FILE.png",
  "sha256": "AUTO_CALCULATE_FROM_IMAGE_BYTES",
  "overwrite": false,
  "purpose": "CHANGE_ME_PURPOSE",
  "createdBy": "chatgpt-image"
}
```

コピー用JSON: [`../examples/manifest.copy-paste.template.json`](../examples/manifest.copy-paste.template.json)

---

## 各項目を超簡単に

| 項目 | 毎回変更？ | 意味 | 例 |
|---|---|---|---|
| `version` | いいえ | manifest仕様version | `1` |
| `taskId` | はい | 今回の配送名。分かりやすく重複しにくくする | `top-night-bg-001` |
| `repo` | はい | 配送先GitHub repo | `m-shogo/vamp-pon` |
| `branch` | はい | 配送先branch | `main` |
| `path` | はい | Git内の保存先。**ファイル名まで含む** | `Assets/Visuals/Top/night-bg.png` |
| `sourceFile` | はい | Drive task内に実在する画像名 | `night-bg.png` |
| `sha256` | 自動 | Driveへ置く画像そのもののSHA-256 | 64文字hex |
| `overwrite` | 通常false | 同pathの別画像を意図的に置換する時だけtrue | `false` |
| `purpose` | 推奨 | 何のためのassetか | `TOP夜背景` |
| `createdBy` | ほぼ固定 | 画像の出所 | `chatgpt-image` |

### 特に間違えやすい2つ

`path`:

```text
GitHub側の最終保存先
フォルダだけではなくファイル名まで書く
```

`sourceFile`:

```text
Drive task folder内に実際に存在する画像ファイル名
1文字でも違えば配送できない
```

---

## 実例

ヨルノシルベのTOP背景を `m-shogo/vamp-pon` の `main` へ送る例:

```json
{
  "version": 1,
  "taskId": "top-night-bg-001",
  "repo": "m-shogo/vamp-pon",
  "branch": "main",
  "path": "Assets/Visuals/Top/top-night-bg.png",
  "sourceFile": "top-night-bg.png",
  "sha256": "実画像から計算した64文字SHA256",
  "overwrite": false,
  "purpose": "ヨルノシルベTOP夜背景",
  "createdBy": "chatgpt-image"
}
```

Drive側:

```text
incoming/
└─ vamp-pon/
   └─ main/
      └─ top-night-bg-001/
         ├─ top-night-bg.png
         └─ manifest.json
```

配送成功後:

```text
m-shogo/vamp-pon @ main
└─ Assets/Visuals/Top/top-night-bg.png
```

---

## サンプルを「そのまま使う」ものではない

サンプルは **構造をコピーするための型** です。

次の値をサンプルのまま配送しないでください。

```text
CHANGE_ME_*
m-shogo/minefa（本当に配送先がminefaの場合を除く）
IMAGE_SHA256_HERE
AUTO_CALCULATE_FROM_IMAGE_BYTES
```

GAS/schema側でもplaceholderを可能な範囲で拒否する設計を維持します。

---

## ChatGPT側の標準手順

画像をGitへ送る依頼を受けたら、以下を1セットとして扱います。

```text
1. 配送先 repo / branch / path を確定
2. 画像の実ファイル名を確定
3. 画像bytesからSHA-256計算
4. taskIdを生成
5. manifest.json生成
6. Driveへ画像upload
7. Driveへmanifest.json upload
8. task folderを再読込
9. 画像 + manifest.json の両方が実在することを確認
10. 初めて「queue投入完了」
```

**重要:** ローカルでmanifestを生成しただけでは未完了です。Drive上に `manifest.json` が実在することまで確認します。

---

## overwriteはいつtrue？

通常は必ず:

```json
"overwrite": false
```

既存pathに違う画像がある場合、falseなら安全に停止します。

`true` は「この既存assetをこの新しい画像で置き換える」と明確に意図している場合だけ使います。

迷ったら `false`。

---

## 最終チェック — これだけ見る

```text
[ ] repoは正しい？
[ ] branchは正しい？
[ ] pathはファイル名まで正しい？
[ ] sourceFileはDrive上の画像名と完全一致？
[ ] sha256はその画像bytesから計算した？
[ ] 上書きが必要でないならoverwrite=false？
[ ] Drive taskに画像が実在？
[ ] Drive taskにmanifest.jsonも実在？ ← 忘れやすいので必須
```

この8項目を通って初めて配送待ち完了です。
