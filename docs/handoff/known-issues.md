# Known Issues（Phase1 監査時点）

## 修正済み（Phase1）

- **MP 未保存**: スキルで撃破した最終ターンの MP が DB に残らない → `syncBattleResourcesToPlayer` で勝敗/逃走前に同期
- **HP 同期**: 同上（レベルアップ全回復とは別問題）

## 未修正（Phase2 候補）

### ジョブ / ステータス

- 加算補正のまま。倍率制・対応サブ・上級メイン未実装
- 巡礼者未 seed

### 装備

- 戦闘 drop で `arms` が weight 表にない
- `legs` / `feet` の area pool 不足
- `set_iron_snow`, `set_valhalla`, `set_black_lamp`, `set_old_king` 未配置

### 武器導線

- Uni 素材が全8職共通2種（職別16種は未実装）
- Src: Kai 経路と manifest 経路の二重定義

### UI / 機能

- 所持品から消耗品使用不可（戦闘内のみ）
- 探索なし4街が `/town list` に表示される

### バランス

- 敵被ダメ: HP 比例 45% + stat 55% → 防御力体感弱
- 中盤敵火力がプレイヤー成長に対して低めの可能性

## 運用

- Phase1 変更の本番反映は未実施（VPS/pm2/deploy 触らない方針）
- 本番 DB 未検証

## 参照

- `reports/phase2-candidates.md`
- `docs/design/phase2-design-notes.md`
