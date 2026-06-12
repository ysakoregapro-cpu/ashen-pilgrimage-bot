# Equipment Route Full Audit

Generated: 2026-06-12T21:30:45.338Z

> Cursor audit for GPT Phase2 design. Not final spec.

## 1. 全武器入手経路
- Total: 82 | Obtainable: 66 | Unobtainable: 16
- Starters: 8 (job select) | Uni: 14 | Src: 13
- See: reports/weapon-acquisition-audit.md

## 2. 初期武器8種
- **剣士**: wpn_traveler_sword → wpn_unique_twilight → src_twilight
- **重騎士**: wpn_training_hammer → wpn_unique_old_hammer → src_silver
- **狩人**: wpn_old_bow → wpn_unique_echo → src_echo
- **魔術師**: wpn_mist_staff → wpn_unique_mist_lantern → src_mist_lantern
- **祈祷師**: wpn_prayer_rod → wpn_unique_lamp → src_lamp
- **斥候**: wpn_rust_dagger → wpn_unique_mirror → src_mirror
- **機工師**: wpn_mini_cannon → wpn_unique_deep → src_deep
- **格闘士**: wpn_leather_gauntlet → wpn_unique_black_fox → src_black_fox
- Uni mats: shared 2 types (mat_starfall_obsidian + mat_black_lantern_cinder) @ 10% rematch
- Src: mat_star_pilgrim_echo ×1 Kai @ 8% Valhalla farm
- Status: mostly **Uni素材が共通すぎる** + **Src経路二重定義**

## 3. Uni導線
- Current materials: mat_starfall_obsidian, mat_black_lantern_cinder (10% rematch)
- Phase2 16 mats: **NOT_IN_SEED** (all proposed IDs)
- Boss assignment candidates: reports/uni-src-route-audit.csv

## 4. Src導線
- Material: mat_star_pilgrim_echo @ 10%
- Kai: facility kai_src (1 mat, no gold)
- manifest: /upgrade manifest (per-weapon src_core mats + gold)
- Phase2 plan (×3 + 5000G): **feasible** without migration

## 5. 全防具入手経路
- Total: 101 | Obtainable: 71 | Unobtainable: 30
| slot | total | pool | shop | unobtainable |
| --- | --- | --- | --- | --- |
| head | 18 | 17 | 3 | 1 |
| body | 18 | 16 | 1 | 1 |
| arms | 18 | 11 | 3 | 7 |
| legs | 18 | 9 | 3 | 8 |
| feet | 18 | 8 | 3 | 7 |

## 6. 脚/靴/腕が出ない原因
- arms **not** in EQUIP_SLOT_WEIGHTS: `{"weapon":30,"head":14,"body":18,"arms":12,"legs":13,"feet":13}`
- legs pool 9/18, feet 8/18, arms 11/18
- pickEquipmentFromAreaPool returns null if slot/rarity mismatch → drop lost
- normal threat: 92% no equip drop even when roll succeeds

## 7. 未配置防具セット
- **set_iron_snow**: 5/5 in pools — truly unplaced if 0
- **set_valhalla**: 5/5 in pools — truly unplaced if 0
- **set_black_lamp**: 5/5 in pools — truly unplaced if 0
- **set_old_king**: 5/5 in pools — truly unplaced if 0

## 8. 装備詳細画面への入手先表示
- Current: items.acquisition_json + getItemAcquisitionHint()
- Gap: no drop %, no Kai/rematch on weapon detail
- Options A/B/C compared in reports/equipment-detail-source-audit.md

## 9. 所持品使用との影響
- No use button today; inv:use custom_id proposed
- Independent from acquisition display; same itemDetailSystem file

## 10. MP/防御/townlistのPhase2影響
- MP: Phase1 syncBattleResourcesToPlayer — verify mp-consumption-order-check PASS
- Defense: combatMath.ts — reports/defense-effect.md
- Town list: town.ts + townActionSystem — 4 placeholder towns

## 11. 実装が必要なもの
- arms in EQUIP_SLOT_WEIGHTS + area pool expansion
- legs/feet/arms per-town pool placement
- 4 unplaced armor sets (iron_snow/valhalla/black_lamp/old_king)
- Per-job Uni materials (16) + boss rematch drops
- Src path unify (Kai ×3 + 5000G vs manifest)
- Rich acquisition display on equipment detail
- Inventory consumable use button + handler
- Placeholder label for 4 towns in /town list

## 12. 実装不要/保留でよいもの
- manifestSrcWeapon legacy path (hide after Kai unify)
- Admin-only / trade-only items
- Full defense rebalance
- Old src_core manifest mats cleanup

## 13. UNKNOWN
- Exact boss IDs for Phase2 Uni mat candidates (some IDs inferred)
- Whether wpn_unique_silver vs wpn_unique_old_hammer both needed for 重騎士
- Job restriction on generic N/R weapons (DB has no required_job)
- Optimal drop % per slot for battle equip (weighted null drops)