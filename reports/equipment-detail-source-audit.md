# Equipment Detail Source Audit

Generated: 2026-06-13T11:05:56.597Z

## Current detail UI files
| File | Role |
| --- | --- |
| `src/systems/itemDetailSystem.ts` | `formatAcquisitionSourceHint`, `buildAcquisitionHintLines`, legacy display |
| `src/utils/inventoryUi.ts` | 所持品一覧、`detail:inv` select |
| `src/systems/inventoryUseSystem.ts` | 所持品使用 `inv:use` |
| `src/db/seedData/masterDataSeed.ts` | builds `acquisition_json` from areas + Kai/Src |
| `src/db/seedData/equipmentClassification.ts` | legacy/excluded registry |

## Current acquisition data
- items with acquisition_json: 261 / equipment 183
- Wrapped { sources: [...] } format: 172
- legacy/excluded → 「入手先：現在通常入手不可」

## Display flow
1. User picks item → `buildEquipmentDetailView`
2. Section「入手」→ `formatAcquisitionSourceHint(itemId, userId)`
3. Parses acquisition_json + EXCLUDED_EQUIPMENT + town unlock masks

## Phase2 consumable use
| Item | Value |
| --- | --- |
| inv:use handler | index.ts + inventoryUseSystem |
| Out of battle | useConsumableOutOfBattle |