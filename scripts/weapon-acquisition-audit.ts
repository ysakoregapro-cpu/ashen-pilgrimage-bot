/** weapon-acquisition-audit — npx tsx scripts/weapon-acquisition-audit.ts */
import { buildWeaponAuditRows, EIGHT_JOB_ROUTES, initAuditDb, TOWN_NAMES } from './audit/acquisitionIndex';
import { AREAS } from '../src/db/seedData/areas';
import {
  UNI_FORGE_MATERIAL_IDS, UNI_FORGE_DROP_RATE, SRC_FORGE_MATERIAL_ID,
  SRC_FORGE_MATERIAL_DROP_RATE, REMATCH_MATERIAL_BOSSES, SRC_FARM_MONSTER_IDS,
} from '../src/db/seedData/forgeMaster';
import { MAX_AWAKENING_LEVEL } from '../src/db/seedData/awakeningMaster';
import { getDb } from '../src/db/database';
import { writeReport, writeCsv, mdTable } from './audit/reportWriter';

function assessRoute(job: string, starter: string, uni: string, src: string, db: ReturnType<typeof getDb>, areaLocs: Map<string, string[]>, shopItems: Set<string>) {
  const unknown: string[] = [];
  let status = 'OK';
  const starterName = (db.prepare('SELECT name FROM items WHERE id=?').get(starter) as { name: string } | undefined)?.name ?? '?';
  const uniRow = db.prepare('SELECT name FROM items WHERE id=?').get(uni) as { name: string } | undefined;
  const srcRow = db.prepare('SELECT name FROM src_weapons WHERE id=?').get(src) as { name: string } | undefined;
  const explore = (areaLocs.get(starter)?.length ?? 0) > 0;
  if (!explore) { status = '初期武器再入手が弱い'; unknown.push('starter not in area pool'); }
  if (UNI_FORGE_MATERIAL_IDS.length === 2) { status = 'Uni素材が共通すぎる'; }
  const uniMats = UNI_FORGE_MATERIAL_IDS.map((id) => {
    const n = (db.prepare('SELECT name FROM items WHERE id=?').get(id) as { name: string })?.name;
    const boss = REMATCH_MATERIAL_BOSSES[id as keyof typeof REMATCH_MATERIAL_BOSSES];
    return `${n} @ ${boss?.label} rematch ${UNI_FORGE_DROP_RATE * 100}%`;
  }).join(' + ');
  const srcMat = (db.prepare('SELECT name FROM items WHERE id=?').get(SRC_FORGE_MATERIAL_ID) as { name: string })?.name;
  const srcFarm = `${srcMat} @ Valhalla ${SRC_FARM_MONSTER_IDS.join('/')} ${SRC_FORGE_MATERIAL_DROP_RATE * 100}%`;
  if (!uniRow) { status = '未実装'; unknown.push('uni item missing'); }
  if (!srcRow) { status = '要修正'; unknown.push('src_weapons row missing'); }
  return {
    job, starter, starterName, uni, uniName: uniRow?.name ?? '?', src, srcName: srcRow?.name ?? '?',
    firstGet: 'ジョブ選択', reget: explore ? areaLocs.get(starter)!.join('; ') : 'pool only/shop',
    shop: shopItems.has(starter) ? 'YES' : 'NO',
    uniCond: `覚醒IV + ch2_silver + 素材各1`, uniMats,
    srcCond: `Kai: ${srcMat}×1 / manifest: per src_weapons`, srcMats: srcFarm,
    kai: 'facilitySystem kai_src', manifest: '/upgrade manifest',
    status, unknown: unknown.join('; ') || '—',
  };
}

function main() {
  initAuditDb();
  const db = getDb();
  const rows = buildWeaponAuditRows();
  const headers = [
    'item_id', 'name', 'rarity', 'weapon_type', 'jobs', 'attack', 'magic', 'defense',
    'max_hp', 'max_mp', 'speed', 'max_upgrade', 'awakening_ok', 'is_uni_base', 'is_uni', 'is_src',
    'is_starter', 'starter_job', 'methods', 'locations', 'source_kinds', 'drop_rates', 'shop',
    'boss', 'rematch', 'valhalla_raid', 'kai', 'manifest', 'obtainable', 'unknown',
  ];
  const csvRows = rows.map((r) => headers.map((h) => String((r as Record<string, unknown>)[h] ?? '')));

  const areaLocs = new Map<string, string[]>();
  for (const a of AREAS) {
    for (const r of a.rewards) {
      if (!r.startsWith('wpn_')) continue;
      if (!areaLocs.has(r)) areaLocs.set(r, []);
      areaLocs.get(r)!.push(`${a.name}（${TOWN_NAMES[a.town] ?? a.town}）`);
    }
  }
  const shopItems = new Set(rows.filter((r) => r.shop === 'YES').map((r) => r.item_id));

  const routeRows = EIGHT_JOB_ROUTES.map((rt) => assessRoute(rt.job, rt.starter, rt.uni, rt.src, db, areaLocs, shopItems));

  const unobtainable = rows.filter((r) => r.obtainable === 'NO');
  const md = [
    '# Weapon Acquisition Audit',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    `Total weapons: ${rows.length} | Obtainable: ${rows.filter((r) => r.obtainable === 'YES').length} | Unobtainable: ${unobtainable.length}`,
    '',
    '## 8-job routes',
    mdTable(['職', '初期', 'Uni', 'Src', '状態', 'UNKNOWN'], routeRows.map((r) => [r.job, r.starterName, r.uniName, r.srcName, r.status, r.unknown])),
    '',
    '## Route detail',
    ...routeRows.map((r) => [
      `### ${r.job}`,
      `- 初期: ${r.starter} (${r.firstGet}) / 再入手: ${r.reget} / shop: ${r.shop}`,
      `- Uni: ${r.uni} — ${r.uniCond} — ${r.uniMats}`,
      `- Src: ${r.src} — Kai: ${r.srcCond} — ${r.srcMats}`,
      `- 経路: Kai=${r.kai}, manifest=${r.manifest}`,
      `- 状態: **${r.status}** | UNKNOWN: ${r.unknown}`,
    ].join('\n')),
    '',
    '## Unobtainable weapons',
    unobtainable.length ? mdTable(['id', 'name', 'rarity'], unobtainable.map((u) => [u.item_id, u.name, u.rarity])) : '(none)',
    '',
    `Max awakening for Uni: ${MAX_AWAKENING_LEVEL}`,
  ].join('\n');

  writeReport('weapon-acquisition-audit.md', md);
  writeCsv('weapon-acquisition-audit.csv', headers, csvRows);
  console.log(`✅ weapon-acquisition-audit → ${rows.length} weapons`);
}

main();
