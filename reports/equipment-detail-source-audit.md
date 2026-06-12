# Equipment Detail Source Audit

Generated: 2026-06-12T21:30:44.107Z

## Current detail UI files
| File | Role |
| --- | --- |
| `src/systems/itemDetailSystem.ts` | `buildEquipmentDetailView`, `getItemAcquisitionHint`, embed「入手」 |
| `src/utils/inventoryUi.ts` | 所持品一覧、`detail:inv` select |
| `src/index.ts` | `detail:inv`, `detail:compare`, upgrade handlers |
| `src/interactions/uxHandler.ts` | inventory detail pick |
| `src/db/seedData/masterDataSeed.ts` | builds `acquisition_json` from areas + monster drops |
| `src/db/seedData/equipmentMaster.ts` | `ACQUISITION_OVERRIDES` manual entries |

## Current acquisition data
- items.acquisition_json: **exists** (added by masterDataSeed)
- items with acquisition_json: 254 / equipment 183
- Generic fallback「探索・ボス・店」: 108 equipment rows
- items.source_text: exists (short hint)
- items.metadata_json / effect_json: **not used for acquisition**

## Display flow
1. User picks item → `buildEquipmentDetailView` / `buildCatalogItemDetail`
2. Section「入手」→ `getItemAcquisitionHint(userId, itemId)`
3. Parses acquisition_json OR ACQUISITION_OVERRIDES
4. Masks locked towns / unreached flags

## Gap for Phase2 rich display
- No drop % in acquisition_json
- No Kai forge path in acquisition_json (only SPECIAL_MATERIAL_USAGE for mats)
- No rematch-specific entries for Uni mats on weapon detail
- Generic fallback too vague for equipment detail

## Option comparison (GPT decides)

### A: items.acquisition_json extension
| 点 | 評価 |
| --- | --- |
| migration | column exists — extend JSON schema only |
| seed管理 | masterDataSeed + overrides; add drop_rate field |
| 表示 | itemDetailSystem already reads it |
| 懸念 | JSON bulk; rematch/Kai paths need manual overrides |

### B: equipmentAcquisitionMap.ts (code map)
| 点 | 評価 |
| --- | --- |
| migration | 不要 |
| seed管理 | 二重管理リスク（seed vs map） |
| 表示 | 安定・型安全 |
| 懸念 | 全装備分のメンテ |

### C: item_acquisition_sources table
| 点 | 評価 |
| --- | --- |
| migration | **必要** (new table) |
| seed管理 | seed script or CSV import |
| 表示 | JOIN query, sort_order, rich text |
| 懸念 | 管理コスト; best for many sources per item |

**Cursor recommendation (not final):** extend **A** short-term (acquisition_json + overrides for Kai/rematch), consider **C** if >3 sources per item with rates

## Phase2 consumable use (inventory interaction)
| Item | Value |
| --- | --- |
| battle_usable | battleSystem.useBattleItem only |
| consumable UI | no use button in itemDetailSystem |
| Proposed custom_id | `inv:use:{inventoryId}:{page}:{category}` |
| Handler | index.ts + uxHandler.ts new branch |
| DB change | **not required** (battle_effect_json exists) |
| componentSafety | inventoryId in id avoids duplicate static ids |
| Conflict with detail | add「使用する」row beside detail:inv — separate custom_id prefix |

## Affected files (Phase2 detail + use)
- `itemDetailSystem.ts` — enrich getItemAcquisitionHint / new formatAcquisitionBlock
- `masterDataSeed.ts` or new seed — acquisition sources with rates
- `inventoryUi.ts` — optional use button row
- `index.ts` / `uxHandler.ts` — inv:use handler
- `inventorySystem.ts` — useConsumableOutOfBattle (new)

## MP / defense / townlist (Phase2 impact recap)
- MP fix: `syncBattleResourcesToPlayer` in battleSystem (Phase1) — no slash deploy
- Defense: `combatMath.ts` calcEnemyDamageToPlayer — HP 45% + stat 55%
- Town placeholder: `src/commands/town.ts` list sub (lines 45-51), `townActionSystem.buildTravelList`