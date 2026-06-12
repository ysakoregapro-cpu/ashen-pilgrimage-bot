# Armor Acquisition Audit

Generated: 2026-06-12T22:35:36.116Z

Total armor/accessory: 101

## Slot summary (head/body/arms/legs/feet)
| slot | 実装数 | 入手可能 | 入手不可 | area_pool | shop | boss | raid | unobtainable |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| head | 18 | 22 | 0 | 18 | 4 | 0 | 0 | 0 |
| body | 18 | 18 | 0 | 17 | 1 | 0 | 0 | 0 |
| arms | 18 | 21 | 0 | 18 | 3 | 0 | 0 | 0 |
| legs | 18 | 21 | 0 | 18 | 3 | 0 | 0 | 0 |
| feet | 18 | 21 | 0 | 18 | 3 | 0 | 0 | 0 |

## Drop weight issue
- EQUIP_SLOT_WEIGHTS: `{"weapon":30,"head":14,"body":18,"arms":12,"legs":13,"feet":13}`
- arms in weight table (Phase2): weight=12
- normalizeSlot: legs/feet/head/body/arms supported
- Battle equip drop rates (normal): [{"kind":"none","weight":92},{"rarity":"N","weight":4},{"rarity":"R","weight":4},{"rarity":"SR","weight":1}]
- If slot roll has no matching item in pool → **null (drop vanishes)**

## Legs/feet/arms root cause
- legs pool: 18/18
- feet pool: 18/18
- arms pool: 18/18
- Shop legs/feet/arms: rare (mostly head/body in early shops)

## Unplaced sets
- **set_iron_snow**: ✅ 全部位pool配置済 — head:arm_set_iron_snow_head (def18 hp10), body:arm_set_iron_snow_body (def20 hp20), arms:arm_set_iron_snow_arms (def17 hp10), legs:arm_set_iron_snow_legs (def17 hp10), feet:arm_set_iron_snow_feet (def17 hp10)
- **set_valhalla**: ✅ 全部位pool配置済 — head:arm_set_valhalla_head (def22 hp10), body:arm_set_valhalla_body (def24 hp20), arms:arm_set_valhalla_arms (def21 hp10), legs:arm_set_valhalla_legs (def21 hp10), feet:arm_set_valhalla_feet (def21 hp10)
- **set_black_lamp**: ✅ 全部位pool配置済 — head:arm_set_black_lamp_head (def16 hp10), body:arm_set_black_lamp_body (def18 hp20), arms:arm_set_black_lamp_arms (def15 hp10), legs:arm_set_black_lamp_legs (def15 hp10), feet:arm_set_black_lamp_feet (def15 hp10)
- **set_old_king**: ✅ 全部位pool配置済 — head:arm_set_old_king_head (def21 hp10), body:arm_set_old_king_body (def23 hp20), arms:arm_set_old_king_arms (def20 hp10), legs:arm_set_old_king_legs (def20 hp10), feet:arm_set_old_king_feet (def20 hp10)

## Phase2.1 endgame set placement
- set_iron_snow / set_valhalla / set_black_lamp / set_old_king — 5部位 pool 配置（equipment-completion-audit 参照）

## Unobtainable armor
| id | name | slot | series |
| --- | --- | --- | --- |
|  |