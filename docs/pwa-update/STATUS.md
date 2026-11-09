# 配信整合性と旧キャッシュからの更新 v241（2026-11-09）

調査時の公開index.html・mobile.js?build=240・sw.jsはmain原本とSHA-256が一致。GitHub PagesのHTTP応答にはmax-age=600があった。利用者のAndroid端末内キャッシュを直接取得してはいないため、当該端末の個別原因は断定しない。

従来SWはネットワーク優先で、成功応答をファイル単位で随時キャッシュへ書き込み、fetchのHTTPキャッシュを明示的に更新しなかった。HTMLとmobile.js等の同一リリース照合もなく、キャッシュ名・表示バージョンが同じでも内容の混在を拒否できなかった。非同期の古い応答による上書きも可能だった。

v241は全アセットのSHA-256を持つSWを生成する。全取得・全照合を完了してからリリースキャッシュへ格納し、失敗時は既存SW/キャッシュを保持。キャッシュ名にはビルド番号と全内容から算出した識別子を含める。HTMLのナビゲーションとアセットを同じ検証済みキャッシュから配信し、ネットワーク応答で個別上書きしない。削除範囲は当アプリの旧シェルキャッシュだけ。IndexedDB・localStorage・他アプリのキャッシュを消さない。

HTML識別子、実際のmobile.js識別子、制御中SWの識別子を別に確認する。更新時は対戦保存完了後に再読込し、保存失敗・AI動作中は再読込を待つ。原本DB・画像台帳・固定デッキJSON・対戦エンジンは変更していない。

## 検査

- Node：古いCDN応答のSHA不一致で更新拒否、全取得後の有効化、検証済みHTML配信、他キャッシュ保持、保存失敗時に再読込しないことを検査。
- Chromium Pixel 5 Android Chrome相当：旧f040d35の実UI/JSをv240の表示・キャッシュ名で保持する意図的な混在fixtureを作り、「v240なのにAI試験対戦」の状態から更新。localhostのsecure contextで旧HTTPS登録条件のみ有効化し、Service Worker/HTTPサーバー/IndexedDB自体は実物を使用した。これは実機から回収したキャッシュではなく、同症状の再現fixtureである。
- mobile.jsだけ古いバイトを配信した段階では新SWのインストールを拒否し、旧UI/保存を保持。整合した配信へ切り替えると自動更新され、「固定デッキ対戦」が出現。既存対戦状態は完全一致し、localStorage・他アプリキャッシュも保持。
- 実配信ファイルとSW内キャッシュのSHA-256を照合。固定デッキを開始し、初期手札・場の公式画像7件、オフライン再読込後の完全復元、JS例外なしを確認。

再生成：`node scripts/build-pwa-release.cjs`。以後、index.html・同梱JS/CSS/JSONを変更した場合はバージョンを更新して再生成する。`--check`は収録内容の変更を検出する。

再検査：`node tests/pwa-release.test.cjs`、`CHROMIUM_EXECUTABLE=/usr/bin/chromium python tests/test_pwa_upgrade_browser.py`、`python tests/test_release_delivery_browser.py`。公開版検査には`POKECA_TEST_URL`を指定する。Android物理実機での修正版確認は未実施。

公開v241でも、Service Workerを通さない別ブラウザコンテキストから取得したHTML・mobile.js・更新JS・SWのSHA-256が原本と一致し、実際に制御中のSW内の全収録ファイルもリリース台帳と一致した。固定デッキ開始、初期画像7件、オフライン完全復元、従来のPWAオフライン/オンライン復元が合格。実v240コミット41e9d60の固定デッキ保存対戦も、新SWへ更新した後に完全一致した（actual-v240-upgrade-results.json）。

GitHub Actions Complete offline regression（42569052536）はsuccess。正式印刷版未確定の旧画像ゲートは従来どおり別判定であり、暫定プレビューを正式採用としていない。画像の再収集は不要のため画像収集Actions（42569052322）は中止し、既存証跡を保持した。
