/** armor-drop-audit — npx tsx scripts/armor-drop-audit.ts */
import { getDb } from '../src/db/database';
import { ensurePhase2Seed } from '../src/db/seedData/phase2Seed';
import { ensureMaterialsSeed } from '../src/db/seedData/materials';
import { AREAS } from '../src/db/seedData/areas';
import { EQUIP_SLOT_WEIGHTS } from '../src/systems/equipmentDropSystem';
import { getShopCatalog } from '../src/systems/shopSystem';
import { writeReport, writeCsv, mdTable } from './audit/reportWriter';

const ARMOR_SLOTS = ['head', 'body', 'arms', 'legs', 'feet', 'accessory1', 'accessory2'] as const;

function main() {
  ensureMaterialsSeed(getDb());
  ensurePhase2Seed(getDb());
  const db = getDb();

  const armor = db.prepare(`
    SELECT i.id, i.name, i.rarity, e.slot, e.series_id
    FROM items i JOIN equipment e ON i.id = e.item_id
    WHERE i.category = 'equipment' AND e.slot IN ('head','body','arms','legs','feet','accessory1','accessory2')
  `).all() as Array<{ id: string; name: string; rarity: string; slot: string; series_id: string | null }>;

  const inAreaPool = new Set<string>();
  for (const a of AREAS) for (const r of a.rewards) inAreaPool.add(r);

  const inShop = new Set<string>();
  for (const t of db.prepare('SELECT id FROM towns').all() as Array<{ id: string }>) {
    for (const s of getShopCatalog(t.id)) inShop.add(s.item_id);
  }

  const slotStats: Record<string, { total: number; inPool: number; inShop: number; neither: number }> = {};
  for (const slot of ARMOR_SLOTS) slotStats[slot] = { total: 0, inPool: 0, inShop: 0, neither: 0 };

  const detailRows: string[][] = [];
  for (const a of armor) {
    const pool = inAreaPool.has(a.id);
    const shop = inShop.has(a.id);
    const acquire = pool || shop ? 'YES' : 'NO';
    slotStats[a.slot]!.total++;
    if (pool) slotStats[a.slot]!.inPool++;
    if (shop) slotStats[a.slot]!.inShop++;
    if (!pool && !shop) slotStats[a.slot]!.neither++;
    detailRows.push([a.id, a.name, a.rarity, a.slot, acquire, pool ? 'area' : '', shop ? 'shop' : '']);
  }

  const missingSets = ['set_iron_snow', 'set_valhalla', 'set_black_lamp', 'set_old_king'];
  const missingNotes = missingSets.map((s) => {
    const cnt = armor.filter((a) => a.series_id === s).length;
    const anyPool = armor.filter((a) => a.series_id === s && inAreaPool.has(a.id)).length;
    return `${s}: ${cnt} pieces, ${anyPool} in area pools`;
  });

  const summaryRows = ARMOR_SLOTS.map((slot) => {
    const s = slotStats[slot]!;
    return [slot, String(s.total), String(s.inPool + s.inShop - 0), String(s.neither), '0'];
  });

  const md = [
    '# Armor Drop Audit',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    '## EQUIP_SLOT_WEIGHTS (battle drop)',
    JSON.stringify(EQUIP_SLOT_WEIGHTS),
    '**Note: `arms` not in weight table → battle drop never rolls arms**',
    '',
    '### Slot summary',
    mdTable(['部位', '実装数', '入手可能(概算)', '入手不可', 'UNKNOWN'], summaryRows),
    '',
    '## Legs / Feet',
    `- legs in area pools: ${armor.filter((a) => a.slot === 'legs' && inAreaPool.has(a.id)).length}/${slotStats.legs!.total}`,
    `- feet in area pools: ${armor.filter((a) => a.slot === 'feet' && inAreaPool.has(a.id)).length}/${slotStats.feet!.total}`,
    `- arms in area pools: ${armor.filter((a) => a.slot === 'arms' && inAreaPool.has(a.id)).length}/${slotStats.arms!.total}`,
    '',
    '## Unplaced armor sets',
    ...missingNotes.map((n) => `- ${n}`),
    '',
    '## Phase2 fixes',
    '- Add legs/feet/arms to area rewards per town tier',
    '- Add arms to EQUIP_SLOT_WEIGHTS or fallback pick',
    '- Place iron_snow / valhalla / black_lamp sets in endgame areas or raid',
  ].join('\n');

  writeReport('armor-drop-audit.md', md);
  writeCsv('armor-drop-audit.csv', ['item_id', 'name', 'rarity', 'slot', 'acquirable', 'area_pool', 'shop'], detailRows);
  console.log('✅ armor-drop-audit → reports/armor-drop-audit.{md,csv}');
}

main();
