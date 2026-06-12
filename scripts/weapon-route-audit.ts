/** weapon-route-audit — npx tsx scripts/weapon-route-audit.ts */
import { getDb } from '../src/db/database';
import { ensurePhase2Seed } from '../src/db/seedData/phase2Seed';
import { ensureMaterialsSeed } from '../src/db/seedData/materials';
import { JOB_STARTER_WEAPONS, STARTER_UNIQUE_TARGETS } from '../src/db/seedData/jobStarterWeapons';
import {
  UNI_FORGE_MATERIAL_IDS, UNI_FORGE_DROP_RATE, SRC_FORGE_MATERIAL_ID,
  SRC_FORGE_MATERIAL_DROP_RATE, REMATCH_MATERIAL_BOSSES, SRC_FARM_MONSTER_IDS,
} from '../src/db/seedData/forgeMaster';
import { AREAS } from '../src/db/seedData/areas';
import { getShopCatalog } from '../src/systems/shopSystem';
import { MAX_AWAKENING_LEVEL } from '../src/db/seedData/awakeningMaster';
import { writeReport, writeCsv, mdTable } from './audit/reportWriter';

const ROUTES: Array<{ job: string; starter: string; uni: string; src: string }> = [
  { job: '剣士', starter: 'wpn_traveler_sword', uni: 'wpn_unique_twilight', src: 'src_twilight' },
  { job: '重騎士', starter: 'wpn_training_hammer', uni: 'wpn_unique_old_hammer', src: 'src_silver' },
  { job: '狩人', starter: 'wpn_old_bow', uni: 'wpn_unique_echo', src: 'src_echo' },
  { job: '魔術師', starter: 'wpn_mist_staff', uni: 'wpn_unique_mist_lantern', src: 'src_mist_lantern' },
  { job: '祈祷師', starter: 'wpn_prayer_rod', uni: 'wpn_unique_lamp', src: 'src_lamp' },
  { job: '斥候', starter: 'wpn_rust_dagger', uni: 'wpn_unique_mirror', src: 'src_mirror' },
  { job: '機工師', starter: 'wpn_mini_cannon', uni: 'wpn_unique_deep', src: 'src_deep' },
  { job: '格闘士', starter: 'wpn_leather_gauntlet', uni: 'wpn_unique_black_fox', src: 'src_black_fox' },
];

function main() {
  ensureMaterialsSeed(getDb());
  ensurePhase2Seed(getDb());
  const db = getDb();

  const areaByItem = new Map<string, string[]>();
  for (const a of AREAS) {
    for (const r of a.rewards) {
      if (!areaByItem.has(r)) areaByItem.set(r, []);
      areaByItem.get(r)!.push(`${a.name}(${a.town})`);
    }
  }

  const shopItems = new Set<string>();
  for (const t of db.prepare('SELECT id FROM towns').all() as Array<{ id: string }>) {
    for (const item of getShopCatalog(t.id)) shopItems.add(item.item_id);
  }

  const uniMats = UNI_FORGE_MATERIAL_IDS.map((id) => {
    const item = db.prepare('SELECT name FROM items WHERE id=?').get(id) as { name: string } | undefined;
    const boss = REMATCH_MATERIAL_BOSSES[id as keyof typeof REMATCH_MATERIAL_BOSSES];
    return `${item?.name ?? id} @ ${boss?.areaHint ?? '?'} rematch ${UNI_FORGE_DROP_RATE * 100}%`;
  }).join(' + ');

  const srcMat = db.prepare('SELECT name FROM items WHERE id=?').get(SRC_FORGE_MATERIAL_ID) as { name: string } | undefined;
  const srcFarm = `${srcMat?.name ?? SRC_FORGE_MATERIAL_ID} @ Valhalla farm ${SRC_FORGE_MATERIAL_DROP_RATE * 100}%`;

  const headers = [
    'job', 'starter_id', 'starter_name', 'starter_sources', 'explore_reget', 'shop',
    'uni_id', 'uni_name', 'uni_condition', 'uni_materials',
    'src_id', 'src_name', 'src_condition', 'src_materials', 'route_status', 'unknown',
  ];
  const rows: string[][] = [];
  const mdRows: string[][] = [];

  for (const r of ROUTES) {
    const starter = db.prepare('SELECT name FROM items WHERE id=?').get(r.starter) as { name: string } | undefined;
    const uni = db.prepare(`
      SELECT i.name, e.src_weapon_id FROM items i JOIN equipment e ON i.id=e.item_id WHERE i.id=?
    `).get(r.uni) as { name: string; src_weapon_id: string | null } | undefined;
    const srcRow = db.prepare('SELECT name FROM src_weapons WHERE id=?').get(r.src) as { name: string } | undefined;
    const srcItem = db.prepare('SELECT name FROM items i JOIN equipment e ON i.id=e.item_id WHERE e.src_weapon_id=? LIMIT 1')
      .get(r.src) as { name: string } | undefined;

    const sources = ['ジョブ選択', ...(areaByItem.get(r.starter) ?? [])].join('; ');
    const exploreOk = (areaByItem.get(r.starter)?.length ?? 0) > 0 ? 'YES' : 'pool only';
    const inShop = shopItems.has(r.starter) ? 'YES' : 'NO';
    const uniCond = `覚醒IV + ch2_silver + 共通素材2種`;
    const srcCond = `Uni + ${srcMat?.name ?? SRC_FORGE_MATERIAL_ID}×1 (Kai)`;
    let status = 'OK';
    const unknown: string[] = [];
    if (!uni) { status = '要確認'; unknown.push('Uni item missing'); }
    if (!srcRow) { status = '要確認'; unknown.push('src_weapons row missing'); }
    if (UNI_FORGE_MATERIAL_IDS.length < 8) { status = '素材不足'; unknown.push('Uni mats shared 2 only (8 jobs)'); }

    const row = [
      r.job, r.starter, starter?.name ?? '?', sources, exploreOk, inShop,
      r.uni, uni?.name ?? '?', uniCond, uniMats,
      r.src, srcItem?.name ?? srcRow?.name ?? '?', srcCond, srcFarm,
      status, unknown.join('; ') || '—',
    ];
    rows.push(row);
    mdRows.push([r.job, starter?.name ?? r.starter, r.uni, uniMats.slice(0, 40) + '…', r.src, srcFarm.slice(0, 30), status]);
  }

  const md = [
    '# Weapon Route Audit (8 jobs)',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    '## Summary',
    `- Uni materials: ${UNI_FORGE_MATERIAL_IDS.join(', ')} (shared, ${UNI_FORGE_DROP_RATE * 100}% rematch)`,
    `- Src Kai material: ${SRC_FORGE_MATERIAL_ID} (${SRC_FORGE_MATERIAL_DROP_RATE * 100}% from ${SRC_FARM_MONSTER_IDS.join(', ')})`,
    `- manifestSrcWeapon path exists separately in srcWeaponSystem.ts (per-weapon mats)`,
    `- Max awakening for Uni: ${MAX_AWAKENING_LEVEL}`,
    '',
    mdTable(['職', '初期', 'Uni', 'Uni素材', 'Src', 'Src素材', '状態'], mdRows),
    '',
    '## Phase2 candidates',
    '- Per-job Uni materials (16 types) — not implemented',
    '- Unify Kai vs manifest Src paths',
  ].join('\n');

  writeReport('weapon-route-audit.md', md);
  writeCsv('weapon-route-audit.csv', headers, rows);
  console.log('✅ weapon-route-audit → reports/weapon-route-audit.{md,csv}');
}

main();
