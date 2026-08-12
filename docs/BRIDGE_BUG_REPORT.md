# Bridge Bug / Improvement Report

他repoで `chatgpt-git-bridge` 起因の不具合・改善点を発見したときのIssue記載用テンプレート。

> PAT、token、credential、個人情報などのsecretは絶対に貼らない。

## Issue title

```text
[bridge-bug] <source-repo>: <short problem>
```

改善要望なら:

```text
[bridge-request] <source-repo>: <short request>
```

## Copy-paste body

```markdown
## Source

- source repo: `m-shogo/...`
- branch:
- commit:
- taskId:
- detected by: ChatGPT / Codex / Claude / human / other

## Severity

- [ ] blocker — 配送不能・原本消失リスク
- [ ] high — 複数taskや通常運用へ影響
- [ ] medium — 回避策あり
- [ ] low — UX / docs / diagnostics改善

## Expected

期待していた動作を書く。

## Actual

実際に起きたことを書く。

## Relevant manifest fields

```json
{
  "repo": "",
  "branch": "",
  "path": "",
  "sourceFile": "",
  "overwrite": false
}
```

※ token / secretは絶対に含めない。

## Safe error.json excerpt

secretを除去した内容だけ貼る。

## Drive state

- [ ] incomingに原本あり
- [ ] processingにあり
- [ ] failedに原本あり
- [ ] 原本の所在不明
- [ ] 成功後cleanup問題のみ

## Reproduction

1.
2.
3.

## Why this appears to be a Bridge issue

manifest / Drive queue / GAS / trigger / GitHub upload / SHA verification / cleanup / recovery のどこに原因があると判断したか。

## Workaround

ある場合だけ書く。

## Cross-reference

- source repo issue/PR:
- related Bridge issue:

## Completion criteria

- [ ] root cause identified
- [ ] fix implemented
- [ ] regression/reproduction test PASS
- [ ] E2E確認（必要な場合）
- [ ] docs/EXPERIMENTSへ新しい学びを反映
- [ ] README/checker/schema等へ再発防止を昇格（必要な場合）
```

## Routing rule

```text
配送先アプリ固有の問題
→ source repo

manifest / Drive / GAS / trigger / GitHub配送 / SHA / cleanup / failed recovery
→ m-shogo/chatgpt-git-bridge

不明
→ source repoで一次調査
→ Bridge起因と判明後、Bridge Issueを作成して相互参照
```

## AI operating rule

他repoを作業しているAIがBridge由来の問題を発見した場合:

1. まず事実を確認し、推測だけでIssueを作らない。
2. 既存Bridge Issueを検索し、同原因があれば新規作成せず追記を優先する。
3. 新規ならこのtemplateでBridge Issueを作る。
4. source repo側にも必要ならBridge Issue番号を残す。
5. 原本assetを失わない。failed recoveryを優先する。
6. 修正後はIssueをcloseするだけでなく、再発防止をコード・checker・docsへ残す。

目的はIssueを増やすことではなく、**別repoで見つかったBridgeの失敗をBridge自身の学習資産へ戻すこと**。
