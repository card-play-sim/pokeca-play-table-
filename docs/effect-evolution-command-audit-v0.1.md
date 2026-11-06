# 特殊進化 Effect Command 接続照合 v0.1
日付: 2026-11-07
判定: BLOCKED（通常進化とは独立した特殊進化の実装契約不足）
変更対象: 本報告書のみ。正式カードDB、既存Effect Command、公開エンジン、保存データは変更しない。

## 照合した実ファイル
- 開発リポジトリ `effect_command_set_v0_1.json`：26 Command、status=proof-5-confirmed
- 開発リポジトリ `effect_engine_integration_spec_v0_1.md`：実証1〜5号の接続境界
- 開発リポジトリ `engine/pokeca_mobile_rules.js`：通常進化 `evolve`
- 公開リポジトリ `ui/engine.bundle.js`：v170で追加した通常進化の段階ガード
- 公開リポジトリ `docs/effect-evolution-contract-v0.1.md`：特殊進化実装前契約

## 事実
1. 承認済み26 Commandには `EVOLVE` / `EVOLVE_POKEMON` / `EFFECT_EVOLUTION` に相当する専用Commandがない。
2. `SEARCH_DECK`、`ADD_TO_HAND`、`RETURN_TO_HAND`、`SWITCH` 等は存在するが、これらの意味を拡張して特殊進化を代用することはできない。
3. 現行の `evolve` は手札からの通常進化アクション。公式カード効果の発生元、対象、例外条件を検証する専用経路ではない。
4. 開発リポジトリの `pokeca_mobile_rules.js` は公開v170のstageガードと一致するとは限らない。公開 bundle を開発 bundle で上書きしない。
5. 既存実証1〜5号に特殊進化の実証済みCommandは確認できない。

## 接続ゲート
- 公式原文と保存済み証跡に基づく対象カード・効果の特定: 未確認
- 特殊進化Commandの入力・対象・カード取得元・許可例外・失敗時rollback契約: 未承認
- Rule Order/atomic commit/instanceId追跡との整合: 要審査
- テスト: 通常進化、段階飛ばし、初回ターン、同ターン連続、例外の独立性、復元互換性を要する

## 判定
NORMAL_EVOLUTION: v170の通常進化ガードを維持（端末動作は未検証）。
EFFECT_EVOLUTION: BLOCKED。カード名別分岐、任意のbypassフラグ、既存Commandの意味変更は禁止。
次の作業は、正式カード効果原本と既存の追加Gap契約に特殊進化が明記されているかの所在確認。見つからなければ新規仕様審査として扱い、実装しない。
