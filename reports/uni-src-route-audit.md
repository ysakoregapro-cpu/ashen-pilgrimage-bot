# Uni / Src Route Audit

Generated: 2026-06-12T21:30:42.937Z

## Current Uni materials (shared)
| id | name | usedBy | qty | rematch boss | rate | pre-Valhalla |
| --- | --- | --- | --- | --- | --- | --- |
| mat_starfall_obsidian | 星見の残光 | 全8職 Uni化（各1） | 1+1 | 月下の観測者 | 10% | YES |
| mat_black_lantern_cinder | 黒灯の残滓 | 全8職 Uni化（各1） | 1+1 | 黒灯の残影 | 10% | YES |

**Confirmed: all 8 jobs share the same 2 Uni materials**

## Current Src material
- mat_star_pilgrim_echo (星巡の残響) ×1 for Kai
- Drop: 10% from rematch/normal on: マキナの残響 (valhalla Lv68); 炉心防衛ユニット (valhalla Lv64); 旧王の影 (valhalla Lv68)
- Valhalla accessible: YES (after unlock)

## Src dual path
| Path | Condition | UI | Reachable | Notes |
| --- | --- | --- | --- | --- |
| Kai (kaiSrcTransform) | Uni + mat_star_pilgrim_echo×1 | facilitySystem 鍛冶 kai_src | YES | player-facing |
| manifest (manifestSrcWeapon) | per-weapon gold + src_core mats | /upgrade manifest | YES (SR filter bug?) | legacy per-weapon mats |
| Phase2 GPT plan | Uni + 星巡の残響×3 + 5000G | not implemented | N/A | align with Kai |

### Impact of unifying to Kai
- manifestSrcWeapon uses per-weapon src_core mats (different from Kai)
- `/upgrade manifest` still exposed; filters SR rarity (may not list Uni)
- Kai path: 1 mat only, sets valhalla_unlocked flag
- Phase2 plan (×3 + 5000G) requires kaiForgeSystem + UI text change

## Phase2 Uni materials (16) — seed feasibility
| item_id | name | job | in_seed | similar | boss_id | boss | rate | reason | concern |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| mat_twilight_blade_shard | 黄昏の剣片 | 剣士 | EXISTS | mat_hourglass_shard; mat_starfall_shard; src_mirror_shard | mon_ash_knight | 灰冠騎士 | 18% | 剣系・中盤 | ヴァルハラ前 |
| mat_starfield_old_steel | 星原の古鋼 | 剣士 | EXISTS | mat_starfield_grass; dism_starfield_cloth; dism_ash_steel | mon_star_slime_king | 星屑王 | 20% | 序盤剣士 | 早期入手 |
| mat_silver_castle_core | 白銀の城核 | 重騎士 | EXISTS | mat_silver_ore; dism_silver_plate; dism_deep_core | mon_silver_golem | 白銀ゴーレム | 18% | 重騎士帯 | — |
| mat_old_furnace_hammer_core | 古炉の鎚芯 | 重騎士 | EXISTS | dism_deep_core; upg_deep_core_stone; boss_furnace_core | mon_furnace_keeper | 炉熱の番人 | 15% | 槌系 | 後半 |
| mat_echo_bowstring | 残響の弦糸 | 狩人 | EXISTS | mat_star_pilgrim_echo; raid_machina_echo; src_echo_core | mon_mist_beast | 霧獣 | 18% | 狩人帯 | — |
| mat_moon_arrowhead | 月弓の鏃 | 狩人 | EXISTS | mat_moon_arrowhead | mon_moon_observer | 月下の観測者 | 15% | 既存rematch boss | shared with obsidian |
| mat_mist_lantern_stardust | 霧灯の星砂 | 魔術師 | EXISTS | wpn_unique_mist_lantern; wpn_src_mist_lantern; mat_mist_lantern_stardust | mon_mist_warden | 霧守り | 18% | 魔術師 | — |
| mat_ash_star_magic_core | 灰星の魔核 | 魔術師 | EXISTS | dism_deep_core; upg_deep_core_stone; boss_furnace_core | mon_ash_wraith | 灰の亡霊 | 15% | 魔力系 | — |
| mat_lampkeeper_holy_oil | 灯守の聖油 | 祈祷師 | EXISTS | rep_oil; mat_lampkeeper_holy_oil | mon_silent_warden | 沈黙の守護 | 18% | 祈祷師 | — |
| mat_pilgrim_prayer_cloth | 巡礼祈祷布 | 祈祷師 | EXISTS | mat_cloth_scrap; dism_torn_cloth; dism_starfield_cloth | mon_prayer_echo | 祈りの残響 | 20% | 祈祷系 | 町に探索なし |
| mat_ash_mirror_fragment | 灰鏡の欠片 | 斥候 | EXISTS | src_mirror_shard; src_mirror_crystal; wpn_unique_mirror | mon_glass_specter | 硝子の亡霊 | 18% | 斥候 | — |
| mat_shadowstep_black_thread | 影渡りの黒糸 | 斥候 | EXISTS | dism_mist_thread; src_bind_thread; mat_shadowstep_black_thread | mon_black_lantern_wraith | 黒灯の残影 | 15% | 既存rematch | shared cinder mat |
| mat_deep_furnace_gear | 深層炉の歯車 | 機工師 | EXISTS | mat_deep_soot; dism_deep_core; upg_deep_core_stone | mon_furnace_defense | 炉心防衛 | 15% | 機工師終盤 | ヴァルハラ前後 |
| mat_black_iron_powder_case | 黒鉄の火薬筒 | 機工師 | EXISTS | boss_black_iron; wpn_black_iron_blade; mat_black_iron_powder_case | mon_black_iron | 黒鉄処刑人 | 18% | 火薬系 | — |
| mat_black_fox_clawmark | 黒狐の爪痕 | 格闘士 | EXISTS | wpn_unique_black_fox; wpn_src_black_fox; mat_black_fox_clawmark | mon_red_ash_beast | 赤灰獣 | 18% | 格闘士 | — |
| mat_ash_fist_bone | 灰拳の骨片 | 格闘士 | EXISTS | mat_cracked_bone; mat_dragonbone; arm_set_dragonbone_head | mon_dragonbone_spirit | 竜骨霊 | 15% | 拳系 | — |

## 8-job route Src note
- 剣士: wpn_unique_twilight → src_twilight (OK)
- 重騎士: wpn_unique_old_hammer → src_silver (MISMATCH base=wpn_unique_silver)
- 狩人: wpn_unique_echo → src_echo (OK)
- 魔術師: wpn_unique_mist_lantern → src_mist_lantern (OK)
- 祈祷師: wpn_unique_lamp → src_lamp (OK)
- 斥候: wpn_unique_mirror → src_mirror (OK)
- 機工師: wpn_unique_deep → src_deep (OK)
- 格闘士: wpn_unique_black_fox → src_black_fox (OK)

## Phase2 Src plan feasibility
- Valhalla explore/rematch/raid: **existing** SRC_FARM_MONSTER_IDS + area pools
- Changing qty 1→3: code-only in kaiForgeSystem
- Adding 5000G: code-only in kaiForgeSystem
- No migration required for materials (mat exists)