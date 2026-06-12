# Item Use Audit

Generated: 2026-06-12T21:30:57.730Z

## Phase2 implementation status
- **`inv:use` 実装済み** — `src/index.ts` handler + `inventoryUseSystem.ts`
- **`itemDetailSystem.ts`** — `battle_usable` かつ consumable のみ `[使用]` ボタン（`inv:use:{inventoryId}`）
- **使用不可アイテム** — 使用ボタン非表示（護符・救難信号片・戦闘専用消耗品等）

## Out-of-battle use rules (`inventoryUseSystem.ts`)
- HP回復: HP満タン時は消費しない（エラー表示）
- MP回復: MP満タン時は消費しない
- 解毒/状態異常解除: 毒/状態異常がない場合は消費しない
- 煙玉・蘇生等の戦闘専用効果: 町・探索中は使用不可

## Battle use (unchanged)
- `battleSystem.ts` → `useBattleItem()` — 戦闘中のみ
- Requires `items.battle_usable=1` and `battle_effect_json`

## Out-of-battle usable consumables
| id | name | effect |
| --- | --- | --- |
| cons_heal_potion | 回復薬 | HP回復 |
| cons_antidote | 解毒薬 | 毒解除 |
| cons_heal_medium | 中回復薬 | HP回復 |
| cons_heal_large | 大回復薬 | HP回復 |
| cons_status_cure | 万能解毒薬 | 毒解除 |

## Non out-of-battle (no use button or blocked)
| id | name | reason |
| --- | --- | --- |
| cons_grind_powder | 研磨粉 | break_boost |
| cons_smoke_bomb | 煙玉 | 逃走 |
| cons_lamp_bottle | 灯火の小瓶 | 蘇生 |
| cons_pilgrim_charm | 巡礼者の護符 | battle_usable=0 |
| cons_rescue_signal | 救難信号片 | battle_usable=0 |

## battle_usable items (all)
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

## consumables summary
| id | name | battle | effect | out_of_battle |
| --- | --- | --- | --- | --- |
| cons_heal_potion | 回復薬 | battle | HP回復 | YES |
| cons_antidote | 解毒薬 | battle | 毒解除 | YES |
| cons_grind_powder | 研磨粉 | battle | break_boost | NO |
| cons_smoke_bomb | 煙玉 | battle | 逃走 | NO |
| cons_lamp_bottle | 灯火の小瓶 | battle | 蘇生 | NO |
| cons_pilgrim_charm | 巡礼者の護符 | — | unknown | NO |
| cons_rescue_signal | 救難信号片 | — | unknown | NO |
| cons_heal_medium | 中回復薬 | battle | HP回復 | YES |
| cons_heal_large | 大回復薬 | battle | HP回復 | YES |
| cons_status_cure | 万能解毒薬 | battle | 毒解除 | YES |