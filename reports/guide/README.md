# Guide Data Export

Generated: 2026-06-13T08:16:06.515Z

## Files

| File | Contents |
|------|----------|
| items.csv | 全アイテム（装備以外含む）の用途・価値・入手・推定レート |
| equipment.csv | 全装備パラメータ・セット・入手・legacy/excluded |
| equipment_sets.csv | 18シリーズのセット効果一覧 |
| drop_routes.csv | 探索pool・名指し高レア・ボス経路 |
| job_unlocks.csv | 基本9 / サブ9 / 上級9 の解放条件 |
| trials.csv | 現身の試練9種 |

## 見方（攻略用）

- **estimated_rate_per_100**: 探索100回あたりの期待入手数（監査推定）。母数は `drop-economy-audit` の pool weight 合算。
- **legacy/excluded**: `equipmentClassification` / `itemPurposeMaster` 準拠。通常プレイ対象外。
- **obtainable**: equipment acquisition audit の current_obtainable。
- 実プレイドロップは章進行・難易度で微調整される — 本CSVは設計監査値。

## 注意

- drop rate / estimated_rate_per_100 は監査上の推定値であり、本番で完全一致しない場合があります。
- acc_raid_random 等 collection 用途装備も obtainable=YES なら equipment 付与対象に含まれます。
