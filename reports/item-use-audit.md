# Item Use Audit

Generated: 2026-06-12T20:07:05.249Z

## Current battle use
- `battleSystem.ts` → `useBattleItem()` — battle only
- Requires `items.battle_usable=1` and `battle_effect_json`
- Inventory UI: **no use button** (`itemDetailSystem.ts` — compare only)

## Out-of-battle use
- **Not implemented** for consumables from inventory
- Inn/shrine heal via `innSystem.ts`
- Facility status cure via `facilitySystem.ts`

## battle_usable items
| id | name | category | effect |
| --- | --- | --- | --- |
| cons_heal_potion | 回復薬 | consumable | HP回復 |
| cons_antidote | 解毒薬 | consumable | 毒解除 |
| cons_grind_powder | 研磨粉 | consumable | break_boost |
| cons_smoke_bomb | 煙玉 | consumable | 逃走 |
| cons_lamp_bottle | 灯火の小瓶 | consumable | 蘇生 |
| cons_heal_medium | 中回復薬 | consumable | HP回復 |
| cons_heal_large | 大回復薬 | consumable | HP回復 |
| cons_status_cure | 万能解毒薬 | consumable | 毒解除 |

## consumables
| id | name | battle | effect |
| --- | --- | --- | --- |
| cons_heal_potion | 回復薬 | battle | HP回復 |
| cons_antidote | 解毒薬 | battle | 毒解除 |
| cons_grind_powder | 研磨粉 | battle | break_boost |
| cons_smoke_bomb | 煙玉 | battle | 逃走 |
| cons_lamp_bottle | 灯火の小瓶 | battle | 蘇生 |
| cons_pilgrim_charm | 巡礼者の護符 | — | unknown |
| cons_rescue_signal | 救難信号片 | — | unknown |
| cons_heal_medium | 中回復薬 | battle | HP回復 |
| cons_heal_large | 大回復薬 | battle | HP回復 |
| cons_status_cure | 万能解毒薬 | battle | 毒解除 |

## Phase2 implementation proposal
- Button on item detail: `inv:use:{inventoryId}:{page}:{category}`
- Handler in `uxHandler.ts` / `index.ts`
- `useConsumableOutOfBattle(userId, inventoryId)` in new or inventorySystem
- DB change: **not required** (use existing battle_effect_json)
- componentSafety: inventoryId in custom_id avoids duplicate static ids

## Difficulty
中 — battle path exists; need UI + non-battle apply + poison sync