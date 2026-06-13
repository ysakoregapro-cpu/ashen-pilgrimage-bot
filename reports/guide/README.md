# Guide Data Export

Generated: 2026-06-13T10:38:16.235Z

## Files

| File | Contents |
|------|----------|
| items.csv | 全アイテム（装備以外含む）の用途・価値・入手・推定レート |
| equipment.csv | 全装備パラメータ・セット・入手・legacy/excluded |
| equipment_sets.csv | 18シリーズのセット効果一覧 |
| drop_routes.csv | 探索pool・名指し高レア・ボス経路 |
| job_unlocks.csv | 基本9 / サブ9 / 上級9 の解放条件 |
| trials.csv | 現身の試練9種 |
| valhalla_rewards.csv | ヴァルハラボス初回/再戦報酬・無答の頁 |
| valhalla_exchange.csv | ヴァルハラ徽章交換表（ui_implemented / currently_available） |

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

## Phase2.6 ヴァルハラボス周回報酬

- **valhalla_rewards.csv**: 初回撃破（頁100%・徽章10・装備1）/ 再戦（徽章4〜8・素材・装備確率・頁4%）。
- **valhalla_exchange.csv**: 徽章10〜300の交換段階。150+頁3（UR抽選）/ 300+頁1（特性保護）は将来UI。
- **ヴァルハラ共闘ボス**: 要塞探索端末→ボス再戦→共闘募集。全員に個別ヴァルハラ報酬（reward_context=valhalla_coop_boss）。
- **徽章交換所**: 要塞探索端末→徽章交換所。10〜120徽章の実装済み交換のみ表示。
- **本格レイドとの違い**: 共闘ボス=徽章周回。本格レイド=将来Phase（挑戦権/週制限/UR武器本体）。
- **無答の守護者の頁**: Src最終強化・UR覚醒・特性保護・UR抽選・上位レイド解放（多くは将来Phase）。
- **ヴァルハラ vs レイド**: ヴァルハラ=防具/アクセ厳選・徽章・素材。レイド=UR武器・レイド専用装備・最上位素材。
- **silent_page_usage**: Src武器最終段階強化(1〜2枚・未実装) / UR装備最終覚醒/上限突破(1枚・未実装) / 防具/アクセ特性再抽選・1枠保護(1枚・未実装) / UR抽選箱(3枚+徽章150・未実装) / 上位レイド解放(初回1枚・未実装)

## Phase2.6 追加 — Src武器性能 / シリーズ入手

- **Src武器**: 最大 `Src+15`。完成時は対応UR+15・覚醒IVより主能力値 **+15〜+25**（中心+20）。
- **ヴァルハラシリーズ**: ボス再戦が主（防具15-25%/アクセ8-15%）。道中おまけ0.1-0.4%。
- **旧王シリーズ**: ボス再戦が主（防具3-6%/アクセ1-3%）。深層道中0.03-0.12%。探索poolからは切り離し。
- **レイド**: UR武器・レイド専用装備の役割は維持（ヴァルハラでUR武器大量ドロップしない）。
