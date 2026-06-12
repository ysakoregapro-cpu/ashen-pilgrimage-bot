# Weapon Route Audit (8 jobs)

Generated: 2026-06-12T21:30:46.484Z

## Summary
- Uni materials: mat_starfall_obsidian, mat_black_lantern_cinder (shared, 10% rematch)
- Src Kai material: mat_star_pilgrim_echo (10% from mon_machina_echo, mon_furnace_defense, mon_old_king_shadow)
- manifestSrcWeapon path exists separately in srcWeaponSystem.ts (per-weapon mats)
- Max awakening for Uni: 4

| 職 | 初期 | Uni | Uni素材 | Src | Src素材 | 状態 |
| --- | --- | --- | --- | --- | --- | --- |
| 剣士 | 旅人の剣 | wpn_unique_twilight | 星見の残光 @ 星落ちの観測所 rematch 10% + 黒灯の残滓 @ 黒灯… | src_twilight | 星巡の残響 @ Valhalla farm 10% | 素材不足 |
| 重騎士 | 訓練用槌 | wpn_unique_old_hammer | 星見の残光 @ 星落ちの観測所 rematch 10% + 黒灯の残滓 @ 黒灯… | src_silver | 星巡の残響 @ Valhalla farm 10% | 素材不足 |
| 狩人 | 古い弓 | wpn_unique_echo | 星見の残光 @ 星落ちの観測所 rematch 10% + 黒灯の残滓 @ 黒灯… | src_echo | 星巡の残響 @ Valhalla farm 10% | 素材不足 |
| 魔術師 | 霧払いの杖 | wpn_unique_mist_lantern | 星見の残光 @ 星落ちの観測所 rematch 10% + 黒灯の残滓 @ 黒灯… | src_mist_lantern | 星巡の残響 @ Valhalla farm 10% | 素材不足 |
| 祈祷師 | 祈りの短杖 | wpn_unique_lamp | 星見の残光 @ 星落ちの観測所 rematch 10% + 黒灯の残滓 @ 黒灯… | src_lamp | 星巡の残響 @ Valhalla farm 10% | 素材不足 |
| 斥候 | 錆びた短剣 | wpn_unique_mirror | 星見の残光 @ 星落ちの観測所 rematch 10% + 黒灯の残滓 @ 黒灯… | src_mirror | 星巡の残響 @ Valhalla farm 10% | 素材不足 |
| 機工師 | 小型機工砲 | wpn_unique_deep | 星見の残光 @ 星落ちの観測所 rematch 10% + 黒灯の残滓 @ 黒灯… | src_deep | 星巡の残響 @ Valhalla farm 10% | 素材不足 |
| 格闘士 | 皮巻きの拳甲 | wpn_unique_black_fox | 星見の残光 @ 星落ちの観測所 rematch 10% + 黒灯の残滓 @ 黒灯… | src_black_fox | 星巡の残響 @ Valhalla farm 10% | 素材不足 |

## Phase2 candidates
- Per-job Uni materials (16 types) — not implemented
- Unify Kai vs manifest Src paths