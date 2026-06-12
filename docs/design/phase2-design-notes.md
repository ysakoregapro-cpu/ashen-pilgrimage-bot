# Phase2 設計ノート（Phase1 監査まとめ）

> Cursor Phase1 成果物。最終設計は GPT 側。

## 現状（コードベース）

| 領域 | 状態 |
|------|------|
| ジョブ | 加算補正、旧 tier 体系、サブ=任意 advanced |
| 戦闘 | MP/HP 永続化修正済み（Phase1） |
| 武器 | 8職 starter→Uni→Src 導線は seed 上存在、Uni 素材は共通2種 |
| 防具 | arms drop なし、legs/feet 希少、未配置セットあり |
| 街 | 22 町 list、4 町は探索エリアなし |
| アイテム使用 | 戦闘内のみ、所持品 UI から使用不可 |

## 問題（監査で確認）

1. **MP/HP**: 撃破/逃走時未保存 → Phase1 で `syncBattleResourcesToPlayer` 追加
2. **装備導線**: arms/legs/feet、鉄雪/ヴァルハラ/黒灯セット
3. **ジョブ**: 倍率制・対応サブ・上級メイン未実装
4. **試練**: 動的現身・解放テーブル未実装
5. **バランス**: 被ダメ HP 比例 45% で防御体感弱い

## Phase2候補

分類一覧: `reports/phase2-candidates.md`

優先度の最終決定は GPT。Cursor 提案の実行順序は記載しない。

## 未確定

- 全倍率表・試練難易度・旧職扱い・Src 二重経路の統一方針
- town list の placeholder 表示ルール
- slash command / migration のデプロイタイミング

## 監査レポート索引

- `reports/job-system-audit.md`
- `reports/stat-formula-check.md`
- `reports/advanced-class-trial-audit.md`
- `reports/weapon-route-audit.md`
- `reports/armor-drop-audit.md`
- `reports/town-implementation-audit.md`
- `reports/item-use-audit.md`
- `reports/battle-damage-curve.md`
- `reports/defense-effect.md`
- `reports/mp-consumption-order-check.md`（スクリプト実行ログ相当）

## Phase1 実施済み

- `syncBattleResourcesToPlayer` + battle 勝敗/逃走同期
- 監査スクリプト 10 本 + `reports/`
- 本 docs 更新
