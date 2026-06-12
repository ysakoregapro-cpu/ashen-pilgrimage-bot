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

  const outOfBattleUsable = consumables.filter((c) => {
    if (!c.battle_usable || !c.battle_effect_json) return false;
    try {
      const t = (JSON.parse(c.battle_effect_json) as { type: string }).type;
      return ['heal_hp', 'heal_mp', 'restore_mp', 'cure_poison', 'cure_status'].includes(t);
    } catch { return false; }
  });

  const nonUsable = consumables.filter((c) => !outOfBattleUsable.includes(c));

  const rows = consumables.map((c) => [
    c.id, c.name, c.battle_usable ? 'battle' : '—', classify(c.battle_effect_json),
    outOfBattleUsable.some((u) => u.id === c.id) ? 'YES' : 'NO',
  ]);

  const md = [
    '# Item Use Audit',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    '## Phase2 implementation status',
    '- **`inv:use` 実装済み** — `src/index.ts` handler + `inventoryUseSystem.ts`',
    '- **`itemDetailSystem.ts`** — `battle_usable` かつ consumable のみ `[使用]` ボタン（`inv:use:{inventoryId}`）',
    '- **使用不可アイテム** — 使用ボタン非表示（護符・救難信号片・戦闘専用消耗品等）',
    '',
    '## Out-of-battle use rules (`inventoryUseSystem.ts`)',
    '- HP回復: HP満タン時は消費しない（エラー表示）',
    '- MP回復: MP満タン時は消費しない',
    '- 解毒/状態異常解除: 毒/状態異常がない場合は消費しない',
    '- 煙玉・蘇生等の戦闘専用効果: 町・探索中は使用不可',
    '',
    '## Battle use (unchanged)',
    '- `battleSystem.ts` → `useBattleItem()` — 戦闘中のみ',
    '- Requires `items.battle_usable=1` and `battle_effect_json`',
    '',
    '## Out-of-battle usable consumables',
    mdTable(['id', 'name', 'effect'], outOfBattleUsable.map((c) => [c.id, c.name, classify(c.battle_effect_json)])),
    '',
    '## Non out-of-battle (no use button or blocked)',
    mdTable(['id', 'name', 'reason'], nonUsable.map((c) => [
      c.id, c.name, !c.battle_usable ? 'battle_usable=0' : classify(c.battle_effect_json),
    ])),
    '',
    '## battle_usable items (all)',
    mdTable(['id', 'name', 'category', 'effect'], battleUsable.map((b) => [b.id, b.name, b.category, classify(b.battle_effect_json)])),
    '',
    '## consumables summary',
    mdTable(['id', 'name', 'battle', 'effect', 'out_of_battle'], rows),
  ].join('\n');

  writeReport('item-use-audit.md', md);
  console.log('✅ item-use-audit → reports/item-use-audit.md');
}

main();
