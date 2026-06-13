/** drop-economy-balance-check — npx tsx scripts/drop-economy-balance-check.ts */
import { AREAS } from '../src/db/seedData/areas';
import { buildEffectiveRewardPool } from '../src/systems/townLootSystem';
import {
  buildDropEconomyRows, getMoonBodySupplyCheck, getNamedHighRarityAudits, getBossSilentPageCheck,
  getBossSilentPageDropPathAudit,
  initDropEconomyAuditDb, NORMAL_EXPLORE_POOL_EXCLUDED,
} from './audit/dropEconomyIndex';
import { buildWeaponAuditRows, buildArmorAuditRows } from './audit/acquisitionIndex';
import { runPhase21AcquisitionFailures } from './audit/phase21Checks';

const fails: string[] = [];
const warns: string[] = [];

function main() {
  const db = initDropEconomyAuditDb();

  // SSR/UR装備が序盤エリアで高頻度に出ない
  for (const area of AREAS.filter((a) => a.min < 20)) {
    const pool = buildEffectiveRewardPool(area.town, area.id);
    for (const p of pool) {
      const row = db.prepare('SELECT category, rarity FROM items WHERE id = ?').get(p.item_id) as { category: string; rarity: string } | undefined;
      if (!row || row.category !== 'equipment') continue;
      if (['SSR', 'UR'].includes(row.rarity)) fails.push(`${area.id}: ${p.item_id} (${row.rarity}) in early area pool`);
    }
  }

  // UR装備が通常探索で大量に出ない
  const urGear = buildDropEconomyRows().filter((r) => r.is_equipment === 'YES' && r.rarity === 'UR' && !r.estimated_rate_band.startsWith('0/'));
  for (const r of urGear) {
    if (r.estimated_rate_band.includes('HIGH') || r.estimated_rate_band.includes('/100 mid')) {
      fails.push(`UR gear oversupplied: ${r.item_id} ${r.estimated_rate_band}`);
    }
  }

  // 月下鎧が月下で大量発生しない
  const moon = getMoonBodySupplyCheck();
  if (moon.rateBand.includes('HIGH') || moon.rateBand.includes('/100 mid')) {
    fails.push(`arm_set_moon_body oversupplied in moon areas: ${moon.rateBand} weight=${moon.totalWeight}`);
  }
  if (moon.areas.length > 1) {
    warns.push(`arm_set_moon_body appears in ${moon.areas.length} moon areas (expected 1): ${moon.areas.join(', ')}`);
  }

  // unknown / non-playable_gear equipment in normal pool
  for (const r of buildDropEconomyRows().filter((x) => x.is_equipment === 'YES' && x.area_sources !== '—')) {
    if (r.current_purpose.includes('unknown')) {
      fails.push(`equipment with unknown purpose in pool: ${r.item_id}`);
    }
    if (!r.current_purpose.includes('playable_gear') && !r.current_purpose.includes('legacy')) {
      fails.push(`equipment without playable_gear purpose in pool: ${r.item_id} (${r.current_purpose})`);
    }
  }

  // 名指し: 無答の守護者の頁 — 通常探索poolに入らない
  const silentPaths = getBossSilentPageDropPathAudit();
  if (silentPaths.exploreAreas.length) {
    fails.push(`boss_silent_page in explore/town pools: ${silentPaths.exploreAreas.join(', ')}`);
  }
  if (silentPaths.monsterDrops.length) {
    fails.push(`boss_silent_page in monster drop pools: ${silentPaths.monsterDrops.join(', ')}`);
  }
  if (silentPaths.duplicateBossEntries !== 1) {
    fails.push(`boss_silent_page BOSS_VICTORY entries: ${silentPaths.duplicateBossEntries} (expected 1)`);
  }

  // 名指し: 黒鉄の処刑刃 — SSR武器として出すぎない
  const named = getNamedHighRarityAudits();
  const ironBlade = named.find((n) => n.item_id === 'wpn_black_iron_blade');
  if (ironBlade) {
    if (ironBlade.estimated_rate_per_100.includes('HIGH') || ironBlade.estimated_rate_per_100.includes('/100 mid')) {
      fails.push(`wpn_black_iron_blade oversupplied: ${ironBlade.estimated_rate_per_100}`);
    }
    console.log(`black iron blade: rate=${ironBlade.estimated_rate_per_100} weight=${ironBlade.weight} sources=${ironBlade.sources}`);
  }
  const silentPage = getBossSilentPageCheck();
  const silentRow = named.find((n) => n.item_id === 'boss_silent_page');
  if (silentRow) {
    if (silentRow.estimated_rate_per_100.includes('HIGH') || silentRow.estimated_rate_per_100.includes('/100 mid')) {
      fails.push(`boss_silent_page oversupplied: ${silentRow.estimated_rate_per_100}`);
    }
    console.log(`silent page: rate=${silentRow.estimated_rate_per_100} boss=${silentPage.bossDrop} paths=${JSON.stringify(silentPaths)}`);
  }

  // legacy/reserved が通常poolに入っていない
  for (const ex of NORMAL_EXPLORE_POOL_EXCLUDED) {
    for (const area of AREAS) {
      const pool = buildEffectiveRewardPool(area.town, area.id);
      if (pool.some((p) => p.item_id === ex)) fails.push(`excluded item ${ex} in ${area.id} effective pool`);
    }
  }

  // 高レア素材に用途がある
  for (const r of buildDropEconomyRows().filter((x) => ['SSR', 'UR'].includes(x.rarity) && x.category === 'material')) {
    if (r.area_sources !== '—' && r.purpose_count === '0') warns.push(`high-rarity material no purpose: ${r.item_id}`);
  }

  // Phase2.1 obtainable
  const wOb = buildWeaponAuditRows().filter((w) => w.obtainable === 'YES').length;
  const aOb = buildArmorAuditRows().filter((a) => a.obtainable === 'YES').length;
  if (wOb < 80) warns.push(`weapons obtainable ${wOb} (low)`);
  if (aOb < 80) warns.push(`armor obtainable ${aOb} (low)`);

  const p21 = runPhase21AcquisitionFailures();
  for (const i of p21) fails.push(`Phase2.1: ${i}`);

  console.log('## drop-economy-balance-check\n');
  console.log(`moon body: ${moon.name} areas=${moon.areas.join(',')} weight=${moon.totalWeight} rate=${moon.rateBand}`);

  if (warns.length) {
    console.log('\n## WARN');
    for (const w of warns) console.log(`- ${w}`);
  } else console.log('\n## WARN\n(none)');

  if (fails.length) {
    console.error('\n## FAIL');
    for (const f of fails) console.error(`- ${f}`);
    process.exit(1);
  }
  console.log('\n✅ drop-economy-balance-check passed');
}

main();
