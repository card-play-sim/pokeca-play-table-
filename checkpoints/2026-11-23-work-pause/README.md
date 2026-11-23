# Work作業停止点 2026-11-23 JST

- 最新確認main `7c07be265ea5a6151fb98517c460fb09880a0ee0`。PR #187（旧同版PWAによる基本炎エネルギー42945のブロック対策）は既に統合。Pages [45164250888](https://github.com/card-play-sim/pokeca-play-table-/actions/runs/45164250888) とbyte照合 [45164251026](https://github.com/card-play-sim/pokeca-play-table-/actions/runs/45164251026) は成功。公開Chromium [45164250534](https://github.com/card-play-sim/pokeca-play-table-/actions/runs/45164250534) は確認時に実行中。Android実機・利用者本人の保存デッキは未確認。
- 未マージのPR [#188](https://github.com/card-play-sim/pokeca-play-table-/pull/188) の保存済みheadは `82834709c91de12a5b561e0cbda4385554f9a873`。相手デッキ選択専用Chromium [45162533698](https://github.com/card-play-sim/pokeca-play-table-/actions/runs/45162533698)、修正後のデッキ編集 [45162533658](https://github.com/card-play-sim/pokeca-play-table-/actions/runs/45162533658) とデッキコード [45162533747](https://github.com/card-play-sim/pokeca-play-table-/actions/runs/45162533747) は成功。UI回帰 [45162533870](https://github.com/card-play-sim/pokeca-play-table-/actions/runs/45162533870) のchromium-suites (7) は確認時に実行中。旧版の失敗は [45161709170](https://github.com/card-play-sim/pokeca-play-table-/actions/runs/45161709170) と [45162022404](https://github.com/card-play-sim/pokeca-play-table-/actions/runs/45162022404)。固定相手に自動で進むという旧テスト前提を、相手の明示選択とブロック表示に合わせて修正済み。
- 最新の公式取込チェックポイントは `automation/control-013-intake-45164437018`、head `362b0687cdcfada34a16bdcec5c218bebd130a1b`。対象5,073、対戦開始照合通過2,290、未接続2,783。新規公開候補0。共通効果2,550、パーサー183、証跡の事実照合44、実行証跡6。今回追加の対戦効果実装は開始していない。
- ローカル5作業ツリーの追跡ファイルを照合。コード差分はマージ済みの #180/#182/#184/#186 の旧作業版で、現行コードへの適用は不要。公式カードのローカル追加レコードはmainまたは最新取込チェックポイントに一致。ローカル解析の失敗記録のうち一致する記録がない49件を `historical-local-blockers.json` に保存。試行時の記録であり、現行ブロック判定の入力にはしない。
- ローカルの旧候補試験では `battle-mass-followup-three-families.test.cjs`（124ms、exit 1）と `battle-mass-named-attack-lock.test.cjs`（127ms、exit 1）が失敗。対応する旧CIは [45122920715](https://github.com/card-play-sim/pokeca-play-table-/actions/runs/45122920715)。未接続一覧に接続済み効果が残ることを期待した試験を公式証跡参照へ修正し、#180に統合済み。

## 再開順

1. このチェックポイントを取得し、最新main、#188の実headと必須CI、#187統合後の公開Chromiumを再確認する。#188は未マージの状態から引き継ぎ、自分・相手各60枚の印刷版IDと保存復元を公開版で確認する。
2. 対戦効果の再開は最新の公式取込ブランチの `reports/official-effect-continuation/atomic-battle-connection-shared-mechanic-worklist.json`。初回は31印刷版に共通するコインのオモテ時だけ山札のポケモン選択を開く処理。オモテ・ウラ、保存復元、公式証跡、公開対戦を既存の一体取込ゲートで検証する。
