# 連続実行の引き継ぎ

## 完成判定

**未完成。固定2デッキでの正式AI対戦は未検証・起動不可。**

PR #1はmainへ統合済み。GitHub Pages: https://card-play-sim.github.io/pokeca-play-table-/

画像・操作練習の合格を正式対戦の合格へ置き換えない。正式採用ID/set/番号が元デッキ資料に結び付いておらず、45種類・120枚が保留。原本1945件の復旧と照合は完了済みであり、原本未回収を理由とする保留ではない。

## 完了済みを繰り返さない

- 元ZIP29ファイル、正式1940件＋識別メタデータ5件は読取専用で照合済み。
- featureの既存93参照とmainの120参照を186件へ統合。共通27件を含む双方の全フィールドを保持。追加93参照は正式原本とID・名前・画像URLを一致検査。
- 5001件の取込・再実行・競合・不正URL隔離を共通照合条件で検査。独立インポーターも印刷版・出典・証跡を保持する。
- 公開版のアプリ本体で固定120枚分の暫定画像、配置、手張り、進化、移動、ターン更新、保存復元、遅延読込、エラー時操作を検査。画像確認専用盤面は使用しない。
- 公開検査で見つかった非同期診断欄による一覧移動を修正。
- AIが攻撃コストに無関係な色のエネルギーを選び、攻撃せず山札切れとなるケースを検出。既存の合法手だけを、状態に明示された攻撃コストで選ぶ方針へ修正。利用可能な攻撃を進化やドローより優先。
- 保存表示は最新のキュー書込が完了したときだけ「自動保存済」にする。古い書込完了による誤表示を防止。
- Rule Engine・Effect Interpreterの判定は変更しない。bundle内の変更はAI baseline policyだけ。同期元は`engine/pokeca_ai_baseline_policy.cjs`、更新は`node scripts/sync-ai-policy.cjs`。

## 再開に必要な外部資料

`data/continuous-completion/adoption-required.json`に45種類ごとの候補と不足条件を保存。必要なのは、元の固定デッキが選んだ公式印刷版IDとセット、番号または公式ページの無印字証跡を結び付ける資料。複数候補から名前だけで採用版を選ばない。名称差異2種類、基本エネルギー3種類の番号なし証跡も記録済み。

既存の検証済みEffect Command資料`card-play-sim/pokeca-card-simulator/card_effects.json`は5カード分で、固定45種類との一致は0。必要な採用版の原文が確定した後に、その原文からEffect Commandを追加する。候補の参照用HP・進化情報を正式カードデータとして昇格しない。

## 検査コマンド

- `node scripts/run-offline-tests.cjs`：全Node検査とAI回帰8本。mjsの5001件容量検査も含む。
- `node scripts/sync-ai-policy.cjs --check`：同期漏れの検出。
- GitHub Actions `Complete offline regression`：Nodeと6組のPython検査。外部画像取得・DB書換なし。
- `CHROMIUM_EXECUTABLE=/usr/bin/chromium POKECA_TEST_URL=https://card-play-sim.github.io/pokeca-play-table-/ python tests/test_fixed_deck_live_app_browser.py`
- 同じ環境変数で`tests/test_published_ai_browser.py`：架空カードのAI対戦2本。正式固定デッキ合格ではない。
- 同じ環境変数で`tests/test_published_pwa_browser.py`：通常のservice workerを有効にし、オフライン保存復元とオンライン復帰を検査。

正式画像検査`tests/test_fixed_deck_browser_images.py`の終了2と、静的検査`node scripts/check-fixed-120-images.cjs`の失敗は現在の正式採用版未確定を表す。無視・無効化してPASSにしない。

最新の公開検査とCIの結果は`data/continuous-completion/`に保存する。物理Android実機は未検査。
