# Decisions

このファイルは「なぜ今この方式なのか」を残す。
新しい方式に変えるときは、古い判断を消さず追記する。

## 2026-08-11 — 専用repoを仕組みのAuthorityにする

### Decision
- `m-shogo/chatgtp-image-to-git` をbridgeの実装・仕様・運用・実験・学習の唯一の正本にする。
- 対象プロダクトrepoへbridge実装そのものを複製しない。
- 対象repoには生成された最終assetだけを置く。

### Why
- プロダクトrepoごとにbridgeが分岐すると、修正漏れ・古い実装・二重管理が発生する。
- ChatGPT / Drive / GitHubの仕様変更時に一箇所だけ更新すればよくなる。
- 成功だけでなく失敗も学習資産として蓄積できる。

### Reconsider when
- bridgeが不要になる公式native連携が提供されたとき。

## 2026-08-11 — Driveを一時配送キューにする

### Decision
- Google Driveは一時配送キューとして使う。
- GitHubを採用済みassetの正本にする。
- Git read-back + SHA-256一致後、Drive task folderを削除する。

### Why
- ChatGPT生成画像は次ターンでも実ファイルとして取得できた。
- ChatGPT → Driveは原本PNGのまま保存できた。
- Driveへ長期保存し続けるとGitとの二重管理・容量圧迫になる。

### Reconsider when
- ChatGPT / GitHub connectorがbinary `file_uri` uploadを直接サポートしたとき。
- ChatGPT ImagesからGitHubへ安全なartifact handoffが公式提供されたとき。

## 2026-08-11 — GASを30分pollingで使う

### Decision
- Apps Scriptのtime-driven triggerを30分ごとに実行する。
- Drive push notification / webhookは現時点では使わない。

### Why
- 画像制作では即時性より簡単さ・無料運用・保守性を優先。
- 1分pollingは過剰。
- webhookはHTTPS endpoint、channel管理などが増え、現状は過剰設計。

### Reconsider when
- 30分遅延が制作フローのボトルネックになったとき。
- Drive変更イベントを簡単に購読できる公式機能が提供されたとき。

## 2026-08-11 — manifestを送り状として使う

### Decision
Driveフォルダ名だけで配送先を決めず、各taskの `manifest.json` を正本にする。

### Required intent
- repo
- branch
- path
- source filename
- sha256
- overwrite policy

### Why
- 画像ごとに保存先が違う。
- branch名には `/` が入る場合があり、Drive階層だけでは曖昧になる。
- folder layout変更後もmanifest契約を維持できる。

## 2026-08-11 — 成功条件はSHA一致

### Decision
GitHub APIが200/201を返しただけでは成功扱いにしない。
GitHubから保存済みファイルをread-backしてSHA-256を比較する。

### Why
- 原本破損・誤転送をfail closedにする。
- Drive原本削除の条件を機械的に証明できる。

## 2026-08-11 — 同名別画像は自動上書きしない

### Decision
- 同一path + 同一SHA: 既に成功済みとしてskip。
- 同一path + 別SHA: `overwrite: true` がない限りfailed。

### Why
意図しないasset差し替えを防ぐため。

## 2026-08-11 — branch消失時にdefault branchへ逃がさない

### Decision
manifestで指定されたbranchが存在しなければfailed。

### Why
feature branch向け画像が誤ってmain/masterへ入る事故を防ぐため。
