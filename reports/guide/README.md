# Guide Data Export

Generated: 2026-06-13T09:25:45.356Z

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

## Phase2.5 ランダム厳選（防具/アクセ）

- **random_affix_eligible**: 防具・アクセ（N〜UR）のみ。武器・店売り・seed・管理者通常付与は対象外。
- **skill_count_probability**: レア度別スキル数（N/R/SRは最大1、SSR/URは最大2）。
- **possible_affix_types**: param（ステ%）> 被ダメ軽減 > 与ダメ増の順で抽選。
- **max_affix_value / godroll_possible**: SSR/URは最大7.0%（理論値は極低確率）。4.5%以上は80%でデバフ付き。
- **理論値**: 7.0%×2スキル×デバフ無しは夢のまた夢 — 周回厳選の目標値。
- **セット統一 vs 混成**: SSR/URセット5部位は安定強度。ランダム混成神個体は理論上セット超え可能だが確率は極小。
- **set_bonus_evaluation**: SSR/URシリーズは Phase2.5 で再調整済（`reports/set-bonus-balance-audit.md` 参照）。
