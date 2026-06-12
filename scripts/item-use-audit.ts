/** item-use-audit — npx tsx scripts/item-use-audit.ts */
import { getDb } from '../src/db/database';
import { ensurePhase2Seed } from '../src/db/seedData/phase2Seed';
import { ensureMaterialsSeed } from '../src/db/seedData/materials';
import { writeReport, mdTable } from './audit/reportWriter';

function main() {
  ensureMaterialsSeed(getDb());
  ensurePhase2Seed(getDb());
  const db = getDb();

  const battleUsable = db.prepare(`
    SELECT id, name, category, battle_effect_json FROM items WHERE battle_usable = 1
  `).all() as Array<{ id: string; name: string; category: string; battle_effect_json: string | null }>;

  const consumables = db.prepare(`
    SELECT id, name, battle_usable, battle_effect_json FROM items WHERE category = 'consumable'
  `).all() as Array<{ id: string; name: string; battle_usable: number; battle_effect_json: string | null }>;

  const classify = (fx: string | null) => {
    if (!fx) return 'unknown';
    try {
      const o = JSON.parse(fx) as { type: string };
      if (o.type === 'heal_hp') return 'HP回復';
      if (o.type === 'cure_poison') return '毒解除';
      if (o.type === 'flee_boost') return '逃走';
      if (o.type === 'revive') return '蘇生';
      return o.type;
    } catch { return 'parse_error'; }
  };

  const rows = consumables.map((c) => [
    c.id, c.name, c.battle_usable ? 'battle' : '—', classify(c.battle_effect_json),
  ]);

  const md = [
    '# Item Use Audit',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    '## Current battle use',
    '- `battleSystem.ts` → `useBattleItem()` — battle only',
    '- Requires `items.battle_usable=1` and `battle_effect_json`',
    '- Inventory UI: **no use button** (`itemDetailSystem.ts` — compare only)',
    '',
    '## Out-of-battle use',
    '- **Not implemented** for consumables from inventory',
    '- Inn/shrine heal via `innSystem.ts`',
    '- Facility status cure via `facilitySystem.ts`',
    '',
    '## battle_usable items',
    mdTable(['id', 'name', 'category', 'effect'], battleUsable.map((b) => [b.id, b.name, b.category, classify(b.battle_effect_json)])),
    '',
    '## consumables',
    mdTable(['id', 'name', 'battle', 'effect'], rows),
    '',
    '## Phase2 implementation proposal',
    '- Button on item detail: `inv:use:{inventoryId}:{page}:{category}`',
    '- Handler in `uxHandler.ts` / `index.ts`',
    '- `useConsumableOutOfBattle(userId, inventoryId)` in new or inventorySystem',
    '- DB change: **not required** (use existing battle_effect_json)',
    '- componentSafety: inventoryId in custom_id avoids duplicate static ids',
    '',
    '## Difficulty',
    '中 — battle path exists; need UI + non-battle apply + poison sync',
  ].join('\n');

  writeReport('item-use-audit.md', md);
  console.log('✅ item-use-audit → reports/item-use-audit.md');
}

main();
