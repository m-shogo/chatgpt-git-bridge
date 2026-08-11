# chatgtp-image-to-git

ChatGPTで生成した画像を、Codex / Work のコンテキストや利用枠をなるべく消費せず、Google Drive を一時配送キューとして GitHub へ安全に届けるための知識・実装・検証リポジトリ。

> このrepoは画像置き場ではありません。
> 画像本体は各対象repoへ入れ、このrepoには仕組み・判断・失敗・改善履歴だけを残します。

## Current best (2026-08-11)

```text
ChatGPT Images
  ↓
Google Drive / ChatGPT-Git-Bridge / incoming
  ↓
manifest.json（送り状）
  ↓
Google Apps Script（30分ごと）
  ↓
GitHub Contents API
  ↓
対象repo / 対象branch / 指定path
  ↓
GitHubからread-back
  ↓
SHA-256完全一致
  ↓
Drive task folderを削除
```

### Drive layout

```text
ChatGPT-Git-Bridge/
├─ incoming/
├─ processing/
└─ failed/
```

実運用では `repo / branch / task` で整理する。

```text
incoming/
└─ minefa/
   └─ feature__top-redesign/
      └─ 20260811-top-bg-001/
         ├─ image.png
         └─ manifest.json
```

Drive上のフォルダは人間向け整理。正本の送り先は `manifest.json`。

## Principles

- Driveは一時配送キュー。原則として正本ではない。
- Gitを採用済みassetの正本にする。
- Gitへの保存確認前にDrive原本を削除しない。
- 成功判定はHTTP成功ではなく、Gitからread-backしたbytesのSHA-256一致。
- 同一SHAは冪等成功として重複commitしない。
- 同名・別内容は勝手に上書きしない。
- branchが存在しない場合、default branchへ勝手にフォールバックしない。
- repo allowlistを使う。
- GASの同時実行はLockServiceで防止する。
- 一時的な通信障害は限定回数だけretryする。
- 永続エラーはfailedへ原本ごと退避する。

## Why this repo exists

ChatGPT / Google Drive / GitHub / OpenAI製品の仕様は変わる。
今の最適解を永久の正解として固定せず、より直接的で安全なbinary uploadやconnector連携が出たら置き換える。

更新時は `docs/DECISIONS.md` と `docs/EXPERIMENTS.md` に根拠を残すこと。

## Status

- ChatGPT生成画像を次ターンで実ファイルとして再取得: 実証済み
- ChatGPT → Driveへ原本PNG保存: 実証済み
- ChatGPT → GitHub create_blobで小さな画像をbinary blobとして保存: 実証済み
- Git blob SHA一致: 実証済み
- 大容量PNGをChatGPTコネクタから直接base64転送: 非効率
- Drive → GAS → GitHub: 現在の推奨方式、実運用テスト待ち

