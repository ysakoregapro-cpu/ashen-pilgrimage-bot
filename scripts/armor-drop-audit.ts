/** armor-drop-audit — npx tsx scripts/armor-drop-audit.ts */
import { getDb } from '../src/db/database';
import { ensurePhase2Seed } from '../src/db/seedData/phase2Seed';
import { ensurePhase2EquipmentRoutes } from '../src/db/seedData/ensurePhase2EquipmentRoutes';
import { ensureMaterialsSeed } from '../src/db/seedData/materials';
import { EQUIP_SLOT_WEIGHTS } from '../src/systems/equipmentDropSystem';
import { getShopCatalog } from '../src/systems/shopSystem';
import { writeReport, writeCsv, mdTable } from './audit/reportWriter';

const ARMOR_SLOTS = ['head', 'body', 'arms', 'legs', 'feet', 'accessory1', 'accessory2'] as const;
const ENDGAME_SETS = ['set_iron_snow', 'set_valhalla', 'set_black_lamp', 'set_old_king'] as const;

const TOWN_NAMES: Record<string, string> = {
  red_ash_fort: '赤灰の砦',
  valhalla_fortress: '空中要塞ヴァルハラ',
  black_lantern_lane: '黒灯りの路地',
  ash_capital: '灰冠の王都跡',
};

function buildDbAreaPoolIndex(db: ReturnType<typeof getDb>) {
  const byItem = new Map<string, string[]>();
  const areas = db.prepare(`
    SELECT id, name, town_id, reward_pool_json FROM exploration_areas
  `).all() as Array<{ id: string; name: string; town_id: string; reward_pool_json: string }>;
  for (const a of areas) {
    let pool: Array<{ item_id: string }> = [];
    try { pool = JSON.parse(a.reward_pool_json || '[]'); } catch { /* ignore */ }
    const town = TOWN_NAMES[a.town_id] ?? a.town_id;
    for (const p of pool) {
      if (!p.item_id || p.item_id.startsWith('town_pool_')) continue;
      if (!byItem.has(p.item_id)) byItem.set(p.item_id, []);
      const loc = `${a.name}（${town}）`;
      const list = byItem.get(p.item_id)!;
      if (!list.includes(loc)) list.push(loc);
    }
  }
  return byItem;
}

function main() {
  ensureMaterialsSeed(getDb());
  ensurePhase2Seed(getDb());
  ensurePhase2EquipmentRoutes(getDb());
  const db = getDb();
  const inAreaPool = buildDbAreaPoolIndex(db);

  const armor = db.prepare(`
    SELECT i.id, i.name, i.rarity, e.slot, e.series_id
    FROM items i JOIN equipment e ON i.id = e.item_id
    WHERE i.category = 'equipment' AND e.slot IN ('head','body','arms','legs','feet','accessory1','accessory2')
  `).all() as Array<{ id: string; name: string; rarity: string; slot: string; series_id: string | null }>;

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
    detailRows.push([a.id, a.name, a.rarity, a.slot, a.series_id ?? '—', acquire, pool ? 'area' : '', shop ? 'shop' : '']);
  }

  const setNotes = ENDGAME_SETS.map((setId) => {
    const pieces = armor.filter((a) => a.series_id === setId);
    const inPoolCount = pieces.filter((p) => inAreaPool.has(p.id)).length;
    const locations = [...new Set(pieces.flatMap((p) => inAreaPool.get(p.id) ?? []))];
    return {
      setId,
      total: pieces.length,
      inPool: inPoolCount,
      complete: inPoolCount === pieces.length && pieces.length > 0,
      locations: locations.slice(0, 4).join('; ') || '—',
    };
  });

  const summaryRows = ARMOR_SLOTS.map((slot) => {
    const s = slotStats[slot]!;
    const obtainable = s.inPool + s.inShop;
    return [slot, String(s.total), String(obtainable), String(s.neither), '0'];
  });

  const md = [
    '# Armor Drop Audit',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    '## Source',
    '- Area pools read from **DB `exploration_areas.reward_pool_json`** (includes Phase2 `ensurePhase2EquipmentRoutes`)',
    '- Shop catalog from `getShopCatalog()`',
    '',
    '## EQUIP_SLOT_WEIGHTS (battle drop)',
    JSON.stringify(EQUIP_SLOT_WEIGHTS),
    '- arms included in weight table (Phase2)',
    '',
    '### Slot summary',
    mdTable(['部位', '実装数', '入手可能(概算)', '入手不可', 'UNKNOWN'], summaryRows),
    '',
    '## Legs / Feet / Arms (area pool)',
    `- legs in area pools: ${armor.filter((a) => a.slot === 'legs' && inAreaPool.has(a.id)).length}/${slotStats.legs!.total}`,
    `- feet in area pools: ${armor.filter((a) => a.slot === 'feet' && inAreaPool.has(a.id)).length}/${slotStats.feet!.total}`,
    `- arms in area pools: ${armor.filter((a) => a.slot === 'arms' && inAreaPool.has(a.id)).length}/${slotStats.arms!.total}`,
    '',
    '## Endgame armor sets (Phase2 placement)',
    mdTable(['set', 'pieces', 'in_pool', 'complete', 'sample_locations'], setNotes.map((s) => [
      s.setId, String(s.total), String(s.inPool), s.complete ? 'YES' : 'NO', s.locations,
    ])),
    '',
    '### Placement map',
    '- **set_iron_snow** → area_red_watchtower, area_fire_training（赤灰の砦）',
    '- **set_valhalla** → area_valhalla_outer, area_deep_core（ヴァルハラ）',
    '- **set_black_lamp** → area_cinder_passage, area_black_lantern_alley（黒灯りの路地）',
    '- **set_old_king** → area_broken_throne, area_ash_boulevard（灰冠王都）',
  ].join('\n');

  writeReport('armor-drop-audit.md', md);
  writeCsv('armor-drop-audit.csv', ['item_id', 'name', 'rarity', 'slot', 'series', 'acquirable', 'area_pool', 'shop'], detailRows);
  console.log('✅ armor-drop-audit → reports/armor-drop-audit.{md,csv}');
}

main();
