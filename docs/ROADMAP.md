# Roadmap

この仕組みは暫定解。OpenAI / Google / GitHubの機能が変われば、より単純な方式へ置き換える。

## P0 — Current production candidate

### Drive → GAS → GitHub v1
- 30分time-driven trigger
- repo / branch / task整理
- manifest v1
- repo allowlist
- branch existence check
- source SHA-256 validation
- duplicate detection
- overwrite fail-closed
- Git read-back SHA-256 validation
- success後Drive task削除
- failed退避
- LockService
- bounded retry

### Exit criteria
- full-size PNGでE2E PASS
- retry後もduplicate commitなし
- SHA mismatch時に原本保持
- nonexistent branchでmain/masterへ誤配送しない

## P1 — Operability

- status summary/logを簡潔に残す
- failed taskの原因分類
- failedが残った時だけ通知
- stale processingの自動回収
- 30日以上のfailed cleanupは明示警告後のみ
- 1run最大件数・総byte上限

## P2 — Better batching

必要になった時だけ導入。

### Git transfer batching
- 同一repo + branchの複数assetを1 commitにまとめる
- 1task失敗時に他taskまで巻き戻さない設計
- batch全体のSHA evidence

### Image generation batching
現時点では**1回のChatGPT Images依頼から複数の独立画像ファイルを安定生成できる前提にしない**。

実測では「4枚」「5枚」「12枚」「別ファイル」「独立画像」「コラージュ禁止」と指示しても、1枚のコラージュへ統合される挙動を確認した。

Current rule:

```text
1 image-generation call = 1 asset
```

複数assetが必要な場合:

```text
生成A
→ 次ターンでAをDrive退避
→ 生成B
→ 次ターンでBをDrive退避
→ 生成C
...
```

### Re-evaluate multi-image batching when

以下のどれかが成立した場合、`docs/EXPERIMENTS.md` のEXP-006を再実験する。

- ChatGPT Images公式仕様に複数独立outputが明記される
- UIに明示的な生成枚数指定が追加される
- image generation toolが複数resultを返せるようになる
- 通常ChatGPT runtimeが1ターンで複数image-generation callを安定実行できる

再実験では「見た目が4分割された1PNG」をPASSにしない。**独立した4つ以上のファイル参照/bytesが返ること**を合格条件にする。

v1で困らない限り、Git側のbatch commitも画像生成側の疑似batchも急いで複雑化しない。

## P3 — Less manual setup

- Apps Script project bootstrap支援
- Script Properties validation
- PAT permission check
- setup self-test
- one-click trigger installer

## P4 — Replace GAS when platform improves

以下のどれかが実用化されたらGAS方式を再評価する。

### Candidate A — GitHub connector accepts file_uri
理想:
```text
ChatGPT generated file
→ file_uri
→ GitHub upload_file(file_uri)
```

評価条件:
- private repo対応
- binary bytesを変換しない
- 数十MB程度まで安定
- target branch/path指定可能
- read-backできる

### Candidate B — ChatGPT native artifact → GitHub handoff
評価条件はCandidate Aと同じ。

### Candidate C — Google Drive native event trigger becomes simple
30分pollingを置き換える価値がある場合のみ採用。

## Replacement scorecard

新方式が出たら、以下で比較する。

| Criterion | Weight |
|---|---:|
| byte-exact / no recompression | 5 |
| setup effort | 4 |
| ongoing manual work | 5 |
| free/low cost | 4 |
| private repo safety | 5 |
| duplicate safety | 5 |
| failure recovery | 5 |
| large-file support | 4 |
| observability | 3 |
| vendor lock-in | 2 |

現行方式より明確に優れる場合のみ置換する。

## Learning rule

新しい失敗・発見があった場合:
1. `docs/EXPERIMENTS.md` に事実を追加
2. 設計判断が変わるなら `docs/DECISIONS.md` に追記
3. manifest契約が変わるならversionを上げる
4. 古い仕様を黙って書き換えない
5. READMEのCurrent bestを更新する
