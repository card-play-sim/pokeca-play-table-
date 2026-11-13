# 開発統制・次担当の起動手順（GitHubを唯一の作業起点にする）

更新基準: 2026-11-14 / CODEX-CONTROL-007 / PR #37。**この文書のSHAや実行状況を現在値とみなさず、必ずGitHub APIで再確認する。**

## 0. 新しい担当が最初に実行すること

1. `AGENTS.md` と本書を読む。新しい指示書や担当チャットを作らない。
2. `main` のSHA、[PR #37](https://github.com/card-play-sim/pokeca-play-table-/pull/37) のhead SHA・Draft・mergeability・変更ファイル、[Issue #36](https://github.com/card-play-sim/pokeca-play-table-/issues/36) の優先順位を取得する。
3. **PRの最新head SHAに限定して** Actionsの各runとjobsを取得する。過去の成功を最新成功と誤認しない。`queued` / `in_progress` / `action_required` / `failure` を別扱いにする。
4. FAILなら **失敗ジョブのログと該当ソースだけ**読む。まず共通原因ごとに束ね、再調査やログ全件取得を繰り返さない。
5. 変更は既存PR #37のブランチ `fix/control-007-blocker-diagnostics` へ。別PR・別アプリ・ZIP納品・1枚ずつの個別修正を避ける。変更前にhead SHAを再照合し、競合したら取り直す。
6. 修正→生成物同期→ローカル検証→push→Actions→失敗ログ→共通修正を **一続き**で進める。実行制限はコード修正と混同しない。

## 1. システムの責務と実行順

| 順序 | 担当機能 | 対象 | 判定・出口 |
|---|---|---|---|
| A | 公式証跡・IDゲート | `data/reference-effects/`、`scripts/report-control-005-effect-status.cjs` | 正式印刷IDのBLOCKEDと効果実行のPASS/FAILを分離。公式原文不明は推測しない |
| B | 共通Effect Command/Rule Engine | `engine/pokeca_reference_effect_runtime.cjs`、`engine/pokeca_selection_constraints.cjs` | ワザ・特性・グッズ・サポート・スタジアム等の**共通処理**を修正 |
| C | AI合法ActionとUI接続 | `engine/pokeca_reference_validation_adapter.cjs`、`ui/engine.bundle.js` | AIとUIが同一合法判定、拒否時Game State/RNG不変 |
| D | 生成物・PWA | `scripts/sync-reference-effects.cjs`、`scripts/build-pwa-release.cjs`、`sw.js` | ソース・bundle・manifestのバイト整合。bot自動pushでheadを進めない |
| E | テスト・公開 | `tests/`、Actions、Pages、Chromium | Node/CI→Pages公開SHA→ブラウザ実対戦→保存復元。Android実機は別判定 |

A/B/Cは独立に進められるが、D/Eは統合後のSHAを検証する。画像台帳と正式DBの担当領域には介入しない。

## 2. PR #37 で確認された障害（履歴・再検証必須）

- 2026-11-13: `2974b51` の Cross-category effect regression、Card reflection runtime checks、Refresh verified PWA release manifest は成功。
- 同SHAの G-BASE-008 UI effect contract は Chromium実対戦・既存PWA更新テストの `Page.wait_for_function` 60秒タイムアウト、PWA release hash確認失敗。
- 同SHAの Reference effect provenance gate と offline-node shard 5/7 は `PWA_RELEASE_STALE`、生成物の不一致等で失敗。
- 自動生成コミット `d1d24ff` は Actions `action_required`（実行許可問題）。**テストのFAIL/PASSではない。**
- 2026-11-14 時点の候補headは変わり得る。上記の履歴を現在状態として転記しない。

**優先修復**: (1) `node scripts/sync-reference-effects.cjs --check`、(2) `node scripts/build-pwa-release.cjs --check`、(3) Chromium起動待ちの状態変数と失敗時のコンソール・ネットワーク証跡を調べる。単純にタイムアウト値を増やさない。失敗がGitHubの承認・権限・runner待ちなら同じpushを繰り返さず、権限問題として停止理由を記録する。

## 3. 最小実行コマンド

```bash
node scripts/sync-reference-effects.cjs --check
node scripts/build-pwa-release.cjs --check
node tests/reference-runtime-source-parity.test.cjs
node tests/reference-effect-cross-family-rejection.test.cjs
node tests/control-005-effect-matrix.test.cjs
```

生成物が古い場合のみ、**ソースを先に修正したうえで** `node scripts/sync-reference-effects.cjs && node scripts/build-pwa-release.cjs` を実行し、`ui/engine.bundle.js`、`data/reference-effects/plans.json`、`sw.js` を同一コミットに含める。実行コマンドはリポジトリrootから。

## 4. 完了と報告の契約

**完了** = 最新headの共通効果・出典・オフライン・PWA・Chromiumが成功し、既存公開アプリのPages配信ファイルを照合し、固定120枚の実対戦と保存復元を確認。物理Androidは実機証跡がなければ「未検証」。

**途中** = 修正コミット、PR作成、部分的CI成功、画像表示、botの生成物push。これだけでは公開完了と報告しない。

**報告は短く**: 最新head / 実施した変更 / PASS・FAIL・BLOCKED / 公開版と実対戦証跡 / 残る外部制約。毎回の「ｇ」要求や転送指示は禁止。

## 5. 保護・競合ルール

- 正式1,945件DB、画像台帳6,248件、H/I/J対象4,357件、固定120枚のリスト、保存データを破壊・上書きしない。
- `main` へ直接pushしない。PR #37以外の作業ブランチや画像担当PR #28に書き込まない。
- 公式出典が不明な印刷IDはBLOCKED、ただし共通効果エンジンの検証を停止させない。
- 2回同じ失敗が続いたら、同じ操作を再試行せず、原因分類・手法・実行環境を切り替える。
