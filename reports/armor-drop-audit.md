# Armor Drop Audit

Generated: 2026-06-12T21:30:47.634Z

## Source
- Area pools read from **DB `exploration_areas.reward_pool_json`** (includes Phase2 `ensurePhase2EquipmentRoutes`)
- Shop catalog from `getShopCatalog()`

## EQUIP_SLOT_WEIGHTS (battle drop)
{"weapon":30,"head":14,"body":18,"arms":12,"legs":13,"feet":13}
- arms included in weight table (Phase2)

### Slot summary
| 部位 | 実装数 | 入手可能(概算) | 入手不可 | UNKNOWN |
| --- | --- | --- | --- | --- |
| head | 18 | 20 | 1 | 0 |
| body | 18 | 17 | 1 | 0 |
| arms | 18 | 14 | 7 | 0 |
| legs | 18 | 12 | 8 | 0 |
| feet | 18 | 11 | 7 | 0 |
| accessory1 | 6 | 3 | 3 | 0 |
| accessory2 | 5 | 2 | 3 | 0 |

## Legs / Feet / Arms (area pool)
- legs in area pools: 9/18
- feet in area pools: 8/18
- arms in area pools: 11/18

## Endgame armor sets (Phase2 placement)
| set | pieces | in_pool | complete | sample_locations |
| --- | --- | --- | --- | --- |
| set_iron_snow | 5 | 5 | YES | 赤灰の見張り台（赤灰の砦）; 炎の訓練場（赤灰の砦） |
| set_valhalla | 5 | 5 | YES | ヴァルハラ外郭（空中要塞ヴァルハラ）; 深層炉心（空中要塞ヴァルハラ） |
| set_black_lamp | 5 | 5 | YES | 煤煙の抜け道（黒灯りの路地）; 黒灯りの路地（黒灯りの路地） |
| set_old_king | 5 | 5 | YES | 破れた玉座前（灰冠の王都跡）; 灰の大通り（灰冠の王都跡） |

### Placement map
- **set_iron_snow** → area_red_watchtower, area_fire_training（赤灰の砦）
- **set_valhalla** → area_valhalla_outer, area_deep_core（ヴァルハラ）
- **set_black_lamp** → area_cinder_passage, area_black_lantern_alley（黒灯りの路地）
- **set_old_king** → area_broken_throne, area_ash_boulevard（灰冠王都）