/** item-purpose-audit — npx tsx scripts/item-purpose-audit.ts */
import { buildEffectiveRewardPool } from '../src/systems/townLootSystem';
import { AREAS } from '../src/db/seedData/areas';
import { buildItemPurposeCatalog, FORMAL_ITEM_PURPOSE_KINDS, type ItemPurposeKind } from '../src/db/seedData/itemPurposeMaster';
import { initDropEconomyAuditDb } from './audit/dropEconomyIndex';
import { writeReport, writeCsv, mdTable } from './audit/reportWriter';

const PURPOSE_HEADERS = [
  'id', 'name', 'rarity', 'purpose', 'progressionTier',
  'shouldDropInNormalPool', 'shouldDropInBossPool', 'shouldDropInRaidPool',
  'sinkDescription', 'risk', 'notes',
];

const LEGACY_PURPOSES = new Set<ItemPurposeKind>(['legacy', 'reserved_future']);

function main() {
  const db = initDropEconomyAuditDb();
  const catalog = buildItemPurposeCatalog(db);

  const inNormalPool = new Map<string, string[]>();
  for (const area of AREAS) {
    const pool = buildEffectiveRewardPool(area.town, area.id);
    for (const p of pool) {
      if (!inNormalPool.has(p.item_id)) inNormalPool.set(p.item_id, []);
      inNormalPool.get(p.item_id)!.push(area.id);
    }
  }

  const noUseInPool = catalog.filter((c) => c.purpose === 'needs_sink' && inNormalPool.has(c.id));
  const unknownInPool = catalog.filter((c) => c.purpose === 'needs_sink' && inNormalPool.has(c.id));
  const legacyInPool = catalog.filter((c) => LEGACY_PURPOSES.has(c.purpose) && inNormalPool.has(c.id));
  const shouldNotNormal = catalog.filter((c) => {
    if (c.shouldDropInNormalPool) return false;
    const areaIds = inNormalPool.get(c.id);
    if (!areaIds?.length) return false;
    if (c.id === 'boss_silent_page') return true;
    const nonValhalla = areaIds.filter((aid) => {
      const area = AREAS.find((a) => a.id === aid);
      return !area || area.min < 48;
    });
    if (!nonValhalla.length) return false;
    if (c.purpose === 'src_material' && nonValhalla.every((aid) => {
      const area = AREAS.find((a) => a.id === aid);
      return area && area.min >= 34;
    })) return false;
    return true;
  });

  const purposeCounts = new Map<string, number>();
  for (const c of catalog) purposeCounts.set(c.purpose, (purposeCounts.get(c.purpose) ?? 0) + 1);

  const fails: string[] = [];
  const playableGear = catalog.filter((c) => c.purpose === 'playable_gear');
  const equipmentIds = new Set(
    (db.prepare(`SELECT id FROM items WHERE category = 'equipment'`).all() as Array<{ id: string }>).map((r) => r.id),
  );
  const nonEquipPlayable = playableGear.filter((c) => !equipmentIds.has(c.id));
  if (nonEquipPlayable.length) {
    fails.push(`playable_gear on non-equipment: ${nonEquipPlayable.map((c) => c.id).join(', ')}`);
  }
  if (playableGear.length !== equipmentIds.size) {
    const exempt = new Set(['wpn_unique_silence', 'acc_raid_random']);
    const missing = [...equipmentIds].filter((id) =>
      !playableGear.some((c) => c.id === id) && !exempt.has(id),
    );
    if (missing.length) fails.push(`equipment missing playable_gear: ${missing.slice(0, 5).join(', ')}${missing.length > 5 ? '...' : ''}`);
  }
  for (const kind of FORMAL_ITEM_PURPOSE_KINDS) {
    if (!catalog.some((c) => c.purpose === kind) && kind !== 'reserved_future' && kind !== 'trial_material' && kind !== 'job_material') {
      // optional categories may be 0 — skip warn
    }
  }
  const unknownPurpose = catalog.filter((c) => !FORMAL_ITEM_PURPOSE_KINDS.includes(c.purpose));
  if (unknownPurpose.length) fails.push(`non-formal purpose values: ${unknownPurpose.map((c) => `${c.id}=${c.purpose}`).join(', ')}`);

  if (legacyInPool.length) fails.push(`legacy/reserved in normal pool: ${legacyInPool.map((c) => c.id).join(', ')}`);
  if (shouldNotNormal.length) fails.push(`shouldDropInNormalPool=false but in pool: ${shouldNotNormal.slice(0, 10).map((c) => c.id).join(', ')}`);
  const silent = catalog.find((c) => c.id === 'boss_silent_page');
  if (silent && inNormalPool.has('boss_silent_page')) fails.push('boss_silent_page in normal explore pool');

  const md = [
    '# Item Purpose Audit',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    '## Summary',
    `- Total: ${catalog.length}`,
    `- needs_sink in normal pool: ${noUseInPool.length}`,
    `- legacy/reserved in normal pool: ${legacyInPool.length}`,
    `- playable_gear: ${playableGear.length} (equipment total ${equipmentIds.size})`,
    '',
    '## Purpose counts',
    mdTable(['purpose', 'count'], [...purposeCounts.entries()].sort((a, b) => b[1] - a[1]).map(([p, c]) => [p, String(c)])),
    '',
    '## boss_silent_page',
    silent ? `- purpose: ${silent.purpose}\n- in normal pool: ${inNormalPool.has('boss_silent_page') ? 'YES (FAIL)' : 'NO'}\n- shouldDropInBossPool: ${silent.shouldDropInBossPool}` : '(missing)',
    '',
    '## shouldNotNormal (first 15)',
    shouldNotNormal.length
      ? mdTable(['id', 'name', 'purpose', 'areas'], shouldNotNormal.slice(0, 15).map((c) => [c.id, c.name, c.purpose, (inNormalPool.get(c.id) ?? []).join(', ')]))
      : '(none)',
  ].join('\n');

  writeReport('item-purpose-audit.md', md);
  writeCsv('item-purpose-audit.csv', PURPOSE_HEADERS, catalog.map((c) => PURPOSE_HEADERS.map((h) => {
    const map: Record<string, string> = {
      id: c.id, name: c.name, rarity: c.rarity, purpose: c.purpose,
      progressionTier: c.progressionTier,
      shouldDropInNormalPool: String(c.shouldDropInNormalPool),
      shouldDropInBossPool: String(c.shouldDropInBossPool),
      shouldDropInRaidPool: String(c.shouldDropInRaidPool),
      sinkDescription: c.sinkDescription, risk: c.risk, notes: c.notes,
    };
    return map[h] ?? '';
  })));

  console.log(`✅ item-purpose-audit → ${catalog.length} rows, violations=${fails.length}`);
  if (fails.length) {
    console.error('FAIL');
    for (const f of fails) console.error(`- ${f}`);
    process.exit(1);
  }
}

main();
