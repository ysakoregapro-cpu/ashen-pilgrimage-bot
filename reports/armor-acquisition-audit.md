# Armor Acquisition Audit

Generated: 2026-06-12T21:30:41.753Z

Total armor/accessory: 101

## Slot summary (head/body/arms/legs/feet)
| slot | 実装数 | 入手可能 | 入手不可 | area_pool | shop | boss | raid | unobtainable |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| head | 18 | 20 | 1 | 17 | 3 | 0 | 0 | 1 |
| body | 18 | 17 | 1 | 16 | 1 | 0 | 0 | 1 |
| arms | 18 | 14 | 7 | 11 | 3 | 0 | 0 | 7 |
| legs | 18 | 12 | 8 | 9 | 3 | 0 | 0 | 8 |
| feet | 18 | 11 | 7 | 8 | 3 | 0 | 0 | 7 |

## Drop weight issue
- EQUIP_SLOT_WEIGHTS: `{"weapon":30,"head":14,"body":18,"arms":12,"legs":13,"feet":13}`
- arms in weight table (Phase2): weight=12
- normalizeSlot: legs/feet/head/body/arms supported
- Battle equip drop rates (normal): [{"kind":"none","weight":92},{"rarity":"N","weight":4},{"rarity":"R","weight":4},{"rarity":"SR","weight":1}]
- If slot roll has no matching item in pool → **null (drop vanishes)**

## Legs/feet/arms root cause
- legs pool: 9/18
- feet pool: 8/18
- arms pool: 11/18
- Shop legs/feet/arms: rare (mostly head/body in early shops)

## Unplaced sets
- **set_iron_snow**: ✅ 全部位pool配置済 — head:arm_set_iron_snow_head (def18 hp10), body:arm_set_iron_snow_body (def20 hp20), arms:arm_set_iron_snow_arms (def17 hp10), legs:arm_set_iron_snow_legs (def17 hp10), feet:arm_set_iron_snow_feet (def17 hp10)
- **set_valhalla**: ✅ 全部位pool配置済 — head:arm_set_valhalla_head (def22 hp10), body:arm_set_valhalla_body (def24 hp20), arms:arm_set_valhalla_arms (def21 hp10), legs:arm_set_valhalla_legs (def21 hp10), feet:arm_set_valhalla_feet (def21 hp10)
- **set_black_lamp**: ✅ 全部位pool配置済 — head:arm_set_black_lamp_head (def16 hp10), body:arm_set_black_lamp_body (def18 hp20), arms:arm_set_black_lamp_arms (def15 hp10), legs:arm_set_black_lamp_legs (def15 hp10), feet:arm_set_black_lamp_feet (def15 hp10)
- **set_old_king**: ✅ 全部位pool配置済 — head:arm_set_old_king_head (def21 hp10), body:arm_set_old_king_body (def23 hp20), arms:arm_set_old_king_arms (def20 hp10), legs:arm_set_old_king_legs (def20 hp10), feet:arm_set_old_king_feet (def20 hp10)

## Phase2 endgame set placement (DB pools via ensurePhase2EquipmentRoutes)
- set_iron_snow → area_red_watchtower, area_fire_training
- set_valhalla → area_valhalla_outer, area_deep_core
- set_black_lamp → area_cinder_passage, area_black_lantern_alley
- set_old_king → area_broken_throne, area_ash_boulevard

## Unobtainable armor
| id | name | slot | series |
| --- | --- | --- | --- |
| acc_raid_random | 残響の指輪 | accessory1 | — |
| acc_deep_gear_ring | 深層炉の機構環 | accessory1 | — |
| acc_valhalla_necklace | ヴァルハラの首飾り | accessory1 | — |
| acc_traveler_talisman | 旅人の護符 | accessory2 | — |
| acc_starfall_earring | 星落ちの耳飾り | accessory2 | — |
| acc_old_king_seal | 旧王の印章 | accessory2 | — |
| arm_set_twilight_arms | 薄明篭手 | arms | set_twilight |
| arm_set_mist_arms | 霧守り篭手 | arms | set_mist |
| arm_set_moon_arms | 月下篭手 | arms | set_moon |
| arm_set_silence_arms | 沈黙篭手 | arms | set_silence |
| arm_set_ash_crown_arms | 灰冠篭手 | arms | set_ash_crown |
| arm_set_dragonbone_arms | 竜骨篭手 | arms | set_dragonbone |
| arm_set_starfall_arms | 星落ち篭手 | arms | set_starfall |
| arm_set_silence_body | 沈黙鎧 | body | set_silence |
| arm_set_twilight_feet | 薄明靴 | feet | set_twilight |
| arm_set_mist_feet | 霧守り靴 | feet | set_mist |
| arm_set_moon_feet | 月下靴 | feet | set_moon |
| arm_set_silence_feet | 沈黙靴 | feet | set_silence |
| arm_set_ash_crown_feet | 灰冠靴 | feet | set_ash_crown |
| arm_set_dragonbone_feet | 竜骨靴 | feet | set_dragonbone |
| arm_set_starfall_feet | 星落ち靴 | feet | set_starfall |
| arm_set_starfield_head | 星原兜 | head | set_starfield |
| arm_set_twilight_legs | 薄明腿当て | legs | set_twilight |
| arm_set_mist_legs | 霧守り腿当て | legs | set_mist |
| arm_set_moon_legs | 月下腿当て | legs | set_moon |
| arm_set_silence_legs | 沈黙腿当て | legs | set_silence |
| arm_set_ash_crown_legs | 灰冠腿当て | legs | set_ash_crown |
| arm_set_dragonbone_legs | 竜骨腿当て | legs | set_dragonbone |
| arm_set_starfall_legs | 星落ち腿当て | legs | set_starfall |
| arm_set_deep_furnace_legs | 深層炉腿当て | legs | set_deep_furnace |