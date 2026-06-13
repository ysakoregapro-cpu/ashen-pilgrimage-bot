/**
 * dev-grant-valhalla-test-loadout.ts
 *
 * ヴァルハラ検証用 — 指定 userId のみ dry-run/apply
 *
 * npx tsx scripts/dev-grant-valhalla-test-loadout.ts --user-id 1512670896278470688 --expected-handle saisa_you --level 80 --gold 999999 --all-main-jobs-level 70 --all-sub-jobs-level 70 --all-equipment --max-enhance --max-awaken --unlock-trials --trials-uncleared --dry-run
 * npx tsx scripts/dev-grant-valhalla-test-loadout.ts ... --apply
 */
import { getDb } from '../src/db/database';
import { ensureMaterialsSeed } from '../src/db/seedData/materials';
import { ensurePhase2Seed } from '../src/db/seedData/phase2Seed';
import { ensureMasterDataSeed } from '../src/db/seedData/masterDataSeed';
import { JOB_TRIO_MAP } from '../src/db/seedData/jobProgressionMaster';
import { BASIC_MAIN_JOBS, PHASE2_SUB_JOBS } from '../src/db/seedData/jobMultiplierMaster';
import { MAX_AWAKENING_LEVEL, AWAKENING_ELIGIBLE_RARITIES } from '../src/db/seedData/awakeningMaster';
import { EXCLUDED_EQUIPMENT } from '../src/db/seedData/equipmentClassification';
import { runEquipmentAcquisitionAudit } from '../src/systems/equipmentAcquisitionAudit';
import { recalculatePlayerStats, getPlayer } from '../src/systems/playerSystem';
import { totalExpToReachLevel } from '../src/systems/expSystem';
import { unlockSubJob } from '../src/systems/jobProgressionSystem';
import { getSelectableSubJobs, canStartTrial } from '../src/systems/jobProgressionSystem';
import { getJobLevel } from '../src/systems/jobLevelSystem';
import { setStoryFlag } from '../src/systems/storySystem';
import { applyGodRollToInventoryRow } from '../src/systems/equipmentAffixSystem';
import { getSortedEquippableRows, EQUIP_SELECT_PAGE_SIZE } from '../src/systems/equipmentSystem';
import { nowIso } from '../src/types';

export type Args = {
  userId: string;
  expectedHandle?: string;
  level: number;
  gold: number;
  mainJobLevel: number;
  subJobLevel: number;
  allEquipment: boolean;
  maxEnhance: boolean;
  maxAwaken: boolean;
  unlockTrials: boolean;
  trialsUncleared: boolean;
  godRollSsrPlusArmorAccessories: boolean;
  apply: boolean;
  verifyOnly: boolean;
};

function parseArgs(argv: string[]): Args {
  const get = (flag: string) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const has = (flag: string) => argv.includes(flag);
  const userId = get('--user-id');
  if (!userId) {
    console.error('ERROR: --user-id is required');
    process.exit(1);
  }
  return {
    userId,
    expectedHandle: get('--expected-handle'),
    level: Number(get('--level') ?? 80),
    gold: Number(get('--gold') ?? 999999),
    mainJobLevel: Number(get('--all-main-jobs-level') ?? 70),
    subJobLevel: Number(get('--all-sub-jobs-level') ?? 70),
    allEquipment: has('--all-equipment'),
    maxEnhance: has('--max-enhance'),
    maxAwaken: has('--max-awaken'),
    unlockTrials: has('--unlock-trials'),
    trialsUncleared: has('--trials-uncleared'),
    godRollSsrPlusArmorAccessories: has('--god-roll-ssr-plus-armor-accessories'),
    apply: has('--apply'),
    verifyOnly: has('--verify'),
  };
}

function getPlayableEquipmentIds(db: ReturnType<typeof getDb>): string[] {
  const { rows } = runEquipmentAcquisitionAudit(db);
  return rows.filter((r) => r.current_obtainable === 'YES' && !EXCLUDED_EQUIPMENT[r.item_id]).map((r) => r.item_id);
}

function getOwnedEquipmentIds(db: ReturnType<typeof getDb>, userId: string): Set<string> {
  const rows = db.prepare(`
    SELECT DISTINCT pi.item_id FROM player_inventory pi
    JOIN items i ON pi.item_id = i.id WHERE pi.user_id = ? AND i.category = 'equipment'
  `).all(userId) as Array<{ item_id: string }>;
  return new Set(rows.map((r) => r.item_id));
}

function planChanges(db: ReturnType<typeof getDb>, args: Args) {
  const player = getPlayer(args.userId);
  if (!player) return { error: `Player not found for userId=${args.userId}` as const };

  const mainJobs = BASIC_MAIN_JOBS;
  const subJobs = PHASE2_SUB_JOBS;
  const playable = args.allEquipment ? getPlayableEquipmentIds(db) : [];
  const owned = getOwnedEquipmentIds(db, args.userId);
  const toAdd = playable.filter((id) => !owned.has(id));

  const equipMeta = db.prepare(`
    SELECT e.item_id, e.max_upgrade_level, i.rarity FROM equipment e JOIN items i ON e.item_id = i.id
  `).all() as Array<{ item_id: string; max_upgrade_level: number; rarity: string }>;
  const equipById = new Map(equipMeta.map((e) => [e.item_id, e]));

  return {
    player,
    mainJobs,
    subJobs,
    toAdd,
    ownedCount: owned.size,
    playableCount: playable.length,
    equipById,
  };
}

function ensureAllSubJobUnlocks(db: ReturnType<typeof getDb>, userId: string, ts: string): void {
  for (const baseJob of Object.keys(JOB_TRIO_MAP)) {
    const sub = JOB_TRIO_MAP[baseJob]!.sub;
    db.prepare(`
      INSERT INTO player_sub_job_unlocks (user_id, sub_job, unlocked_at, unlock_source)
      VALUES (?, ?, ?, 'dev_valhalla_test_loadout')
      ON CONFLICT(user_id, sub_job) DO UPDATE SET unlock_source = excluded.unlock_source
    `).run(userId, sub, ts);
    unlockSubJob(userId, sub, 'dev_valhalla_test_loadout');
  }
}

export type EquipmentVerifyResult = {
  weapons: number;
  armor: number;
  accessories: number;
  totalDistinct: number;
  expectedPlayable: number;
  missingIds: string[];
  extraExcluded: string[];
  weaponByRarity: Record<string, number>;
  expectedWeaponByRarity: Record<string, number>;
  missingWeapons: string[];
};

function countWeaponsByRarity(db: ReturnType<typeof getDb>, itemIds: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const id of itemIds) {
    const row = db.prepare(`
      SELECT i.rarity FROM items i JOIN equipment e ON e.item_id = i.id WHERE i.id = ? AND e.slot = 'weapon'
    `).get(id) as { rarity: string } | undefined;
    if (!row) continue;
    out[row.rarity] = (out[row.rarity] ?? 0) + 1;
  }
  return out;
}

function getPlayableWeaponIds(db: ReturnType<typeof getDb>): string[] {
  return getPlayableEquipmentIds(db).filter((id) => {
    const row = db.prepare('SELECT slot FROM equipment WHERE item_id = ?').get(id) as { slot: string } | undefined;
    return row?.slot === 'weapon';
  });
}

export function verifyEquipmentInventory(db: ReturnType<typeof getDb>, userId: string): EquipmentVerifyResult {
  const playable = getPlayableEquipmentIds(db);
  const ownedRows = db.prepare(`
    SELECT DISTINCT pi.item_id, e.slot FROM player_inventory pi
    JOIN items i ON pi.item_id = i.id
    JOIN equipment e ON pi.item_id = e.item_id
    WHERE pi.user_id = ? AND i.category = 'equipment'
  `).all(userId) as Array<{ item_id: string; slot: string }>;
  const owned = new Set(ownedRows.map((r) => r.item_id));
  const missingIds = playable.filter((id) => !owned.has(id));
  const extraExcluded = ownedRows.filter((r) => EXCLUDED_EQUIPMENT[r.item_id]).map((r) => r.item_id);

  const weapons = ownedRows.filter((r) => r.slot === 'weapon').length;
  const armor = ownedRows.filter((r) => ['head', 'body', 'arms', 'legs', 'feet'].includes(r.slot)).length;
  const accessories = ownedRows.filter((r) => r.slot === 'accessory1' || r.slot === 'accessory2').length;
  const ownedWeaponIds = ownedRows.filter((r) => r.slot === 'weapon').map((r) => r.item_id);
  const playableWeapons = getPlayableWeaponIds(db);
  const missingWeapons = playableWeapons.filter((id) => !owned.has(id));

  return {
    weapons,
    armor,
    accessories,
    totalDistinct: owned.size,
    expectedPlayable: playable.length,
    missingIds,
    extraExcluded,
    weaponByRarity: countWeaponsByRarity(db, ownedWeaponIds),
    expectedWeaponByRarity: countWeaponsByRarity(db, playableWeapons),
    missingWeapons,
  };
}

function getEquipSelectVisibleIds(userId: string, slot: string, page: number): Set<number> {
  const rows = getSortedEquippableRows(userId, slot as import('../src/types').EquipmentSlot);
  const start = page * EQUIP_SELECT_PAGE_SIZE;
  return new Set(rows.slice(start, start + EQUIP_SELECT_PAGE_SIZE).map((r) => r.id));
}

function printUiHiddenOnFirstPage(userId: string, slot: import('../src/types').EquipmentSlot): void {
  const rows = getSortedEquippableRows(userId, slot);
  const visible = getEquipSelectVisibleIds(userId, slot, 0);
  const hidden = rows.filter((r) => !visible.has(r.id));
  if (!hidden.length) {
    console.log(`owned but hidden by UI (page 0 ${slot}): none`);
    return;
  }
  console.log(`owned but hidden by UI (page 0 ${slot}, ${hidden.length} — use 次 ▶ for more):`);
  for (const r of hidden.slice(0, 10)) {
    console.log(`  ${r.id} / ${r.name} / ${r.rarity} / pagination`);
  }
  if (hidden.length > 10) console.log(`  … +${hidden.length - 10} more`);
}

function printGodRollVerify(db: ReturnType<typeof getDb>, userId: string): void {
  const rows = db.prepare(`
    SELECT pi.id, pi.affix_json, e.slot, i.rarity, i.name
    FROM player_inventory pi
    JOIN equipment e ON pi.item_id = e.item_id
    JOIN items i ON pi.item_id = i.id
    WHERE pi.user_id = ?
      AND i.rarity IN ('SSR', 'UR')
      AND e.slot IN ('head','body','arms','legs','feet','accessory1','accessory2')
  `).all(userId) as Array<{ id: number; affix_json: string | null; slot: string; rarity: string; name: string }>;
  let ok = 0;
  let bad = 0;
  for (const r of rows) {
    const affixes = r.affix_json ? JSON.parse(r.affix_json) as Array<{ key: string; value: number; drawbackKey: string | null }> : [];
    const atk = affixes.find((a) => a.key === 'attack_percent' && a.value === 7.0);
    const dealt = affixes.find((a) => a.key === 'damage_dealt_percent' && a.value === 7.0);
    const clean = affixes.every((a) => !a.drawbackKey);
    if (atk && dealt && clean) ok++;
    else bad++;
  }
  console.log(`god-roll SSR+ armor/accessories: ${ok} OK / ${bad} not matching / ${rows.length} total`);
  const weaponAffix = db.prepare(`
    SELECT COUNT(*) c FROM player_inventory pi
    JOIN equipment e ON pi.item_id = e.item_id
    WHERE pi.user_id = ? AND e.slot = 'weapon' AND pi.affix_json IS NOT NULL
  `).get(userId) as { c: number };
  console.log(`weapons with affix_json (should be 0): ${weaponAffix.c}`);
  const srAffix = db.prepare(`
    SELECT COUNT(*) c FROM player_inventory pi
    JOIN items i ON pi.item_id = i.id
    WHERE pi.user_id = ? AND i.rarity IN ('N','R','SR') AND pi.affix_json LIKE '%7.0%'
  `).get(userId) as { c: number };
  console.log(`SR- with 7.0% affix (should be 0 unless player rolled): ${srAffix.c}`);
}

function printEquipmentVerify(db: ReturnType<typeof getDb>, userId: string): void {
  const v = verifyEquipmentInventory(db, userId);
  const playableWeapons = getPlayableWeaponIds(db).length;
  console.log(`weapon playable total: ${playableWeapons}`);
  console.log(`weapon owned: ${v.weapons}`);
  console.log('weapon by rarity (owned / expected):');
  for (const rarity of ['N', 'R', 'SR', 'SSR', 'UR', 'Uni', 'Src']) {
    const o = v.weaponByRarity[rarity] ?? 0;
    const e = v.expectedWeaponByRarity[rarity] ?? 0;
    if (o || e) console.log(`  ${rarity}: ${o} / ${e}`);
  }
  console.log(`missing weapons: ${v.missingWeapons.length}`);
  if (v.missingWeapons.length) console.log(`  ${v.missingWeapons.slice(0, 15).join(', ')}`);
  console.log(`armor owned: ${v.armor}/90 (distinct item_id count)`);
  console.log(`accessory owned: ${v.accessories}/11`);
  console.log(`equipment weapons/armor/accessories (distinct item_id): ${v.weapons}/${v.armor}/${v.accessories}`);
  console.log(`equipment total distinct: ${v.totalDistinct} / expected playable ${v.expectedPlayable}`);
  if (v.missingIds.length) {
    console.log(`missing equipment (${v.missingIds.length}): ${v.missingIds.slice(0, 20).join(', ')}${v.missingIds.length > 20 ? '…' : ''}`);
  } else {
    console.log('missing equipment: none');
  }
  if (v.extraExcluded.length) {
    console.warn(`WARN: legacy/excluded in inventory: ${v.extraExcluded.join(', ')}`);
  }
  printUiHiddenOnFirstPage(userId, 'weapon');
  const accRaidOwned = ownedHas(db, userId, 'acc_raid_random');
  const accRaidPlayable = getPlayableEquipmentIds(db).includes('acc_raid_random');
  console.log(`acc_raid_random: playable=${accRaidPlayable ? 'YES' : 'NO'}, owned=${accRaidOwned ? 'YES' : 'NO'} (collection purpose, included when obtainable)`);
}

function ownedHas(db: ReturnType<typeof getDb>, userId: string, itemId: string): boolean {
  return !!db.prepare('SELECT 1 FROM player_inventory WHERE user_id = ? AND item_id = ? LIMIT 1').get(userId, itemId);
}

function printJobUiVerify(userId: string): void {
  const selectableSubs = getSelectableSubJobs(userId).filter((s) => !s.locked);
  console.log(`UI selectable sub jobs: ${selectableSubs.length} (${selectableSubs.map((s) => s.name).join(', ') || 'none'})`);
  for (const job of PHASE2_SUB_JOBS) {
    const lv = getJobLevel(userId, job)?.job_level ?? 0;
    if (lv !== 70) console.warn(`WARN: sub ${job} UI job level ${lv} (expected 70)`);
  }
  for (const job of BASIC_MAIN_JOBS) {
    const lv = getJobLevel(userId, job)?.job_level ?? 0;
    if (lv !== 70) console.warn(`WARN: main ${job} UI job level ${lv} (expected 70)`);
  }
  let trialsOk = 0;
  for (const base of Object.keys(JOB_TRIO_MAP)) {
    if (canStartTrial(userId, base).ok) trialsOk++;
  }
  console.log(`UI trial challengable (canStartTrial): ${trialsOk}/${Object.keys(JOB_TRIO_MAP).length}`);
}

function applyChanges(db: ReturnType<typeof getDb>, args: Args): void {
  const ts = nowIso();
  const totalExp = totalExpToReachLevel(args.level);
  db.prepare('UPDATE players SET level = ?, exp = 0, gold = ?, total_exp = ?, updated_at = ? WHERE user_id = ?')
    .run(args.level, args.gold, totalExp, ts, args.userId);

  if (args.unlockTrials) {
    setStoryFlag(args.userId, 'valhalla_unlocked');
    setStoryFlag(args.userId, 'chapter_completed:ch7_furnace');
    setStoryFlag(args.userId, 'boss_defeated:boss_old_furnace_keeper');
  }

  if (args.trialsUncleared) {
    db.prepare('DELETE FROM player_advanced_job_unlocks WHERE user_id = ?').run(args.userId);
  }

  ensureAllSubJobUnlocks(db, args.userId, ts);

  for (const baseJob of Object.keys(JOB_TRIO_MAP)) {
    db.prepare(`
      INSERT INTO player_job_levels (user_id, job_name, job_level, job_exp, is_main, is_sub, unlocked_at, updated_at)
      VALUES (?, ?, ?, 0, 1, 0, ?, ?)
      ON CONFLICT(user_id, job_name) DO UPDATE SET job_level = excluded.job_level, job_exp = 0, updated_at = excluded.updated_at
    `).run(args.userId, baseJob, args.mainJobLevel, ts, ts);

    const sub = JOB_TRIO_MAP[baseJob]!.sub;
    db.prepare(`
      INSERT INTO player_job_levels (user_id, job_name, job_level, job_exp, is_main, is_sub, unlocked_at, updated_at)
      VALUES (?, ?, ?, 0, 0, 1, ?, ?)
      ON CONFLICT(user_id, job_name) DO UPDATE SET job_level = excluded.job_level, job_exp = 0, is_sub = 1, updated_at = excluded.updated_at
    `).run(args.userId, sub, args.subJobLevel, ts, ts);
  }

  const plan = planChanges(db, args);
  if ('error' in plan) throw new Error(plan.error);

  for (const itemId of plan.toAdd) {
    const meta = plan.equipById.get(itemId);
    const upgrade = args.maxEnhance && meta ? meta.max_upgrade_level : 0;
    const awaken = args.maxAwaken && meta && AWAKENING_ELIGIBLE_RARITIES.has(meta.rarity) ? MAX_AWAKENING_LEVEL : 0;
    db.prepare(`
      INSERT INTO player_inventory (user_id, item_id, quantity, upgrade_level, durability_state, src_level, awakening_level, is_equipped, is_pending_reward, created_at, updated_at)
      VALUES (?, ?, 1, ?, '良好', 0, ?, 0, 0, ?, ?)
    `).run(args.userId, itemId, upgrade, awaken, ts, ts);
  }

  if (args.maxEnhance || args.maxAwaken) {
    const owned = db.prepare(`
      SELECT pi.id, pi.item_id, e.max_upgrade_level, i.rarity
      FROM player_inventory pi
      JOIN items i ON pi.item_id = i.id
      JOIN equipment e ON pi.item_id = e.item_id
      WHERE pi.user_id = ?
    `).all(args.userId) as Array<{ id: number; item_id: string; max_upgrade_level: number; rarity: string }>;
    for (const row of owned) {
      const upgrade = args.maxEnhance ? row.max_upgrade_level : undefined;
      const awaken = args.maxAwaken && AWAKENING_ELIGIBLE_RARITIES.has(row.rarity) ? MAX_AWAKENING_LEVEL : undefined;
      if (upgrade !== undefined || awaken !== undefined) {
        db.prepare(`
          UPDATE player_inventory SET
            upgrade_level = COALESCE(?, upgrade_level),
            awakening_level = COALESCE(?, awakening_level),
            durability_state = '良好',
            updated_at = ?
          WHERE id = ?
        `).run(upgrade ?? null, awaken ?? null, ts, row.id);
      }
    }
  }

  recalculatePlayerStats(args.userId);

  if (args.godRollSsrPlusArmorAccessories) {
    const targets = db.prepare(`
      SELECT pi.id FROM player_inventory pi
      JOIN equipment e ON pi.item_id = e.item_id
      JOIN items i ON pi.item_id = i.id
      WHERE pi.user_id = ?
        AND i.rarity IN ('SSR', 'UR')
        AND e.slot IN ('head','body','arms','legs','feet','accessory1','accessory2')
    `).all(args.userId) as Array<{ id: number }>;
    for (const t of targets) applyGodRollToInventoryRow(db, t.id, args.userId);
    recalculatePlayerStats(args.userId);
  }
}

function printSummary(db: ReturnType<typeof getDb>, args: Args, label: string) {
  const player = getPlayer(args.userId);
  if (!player) {
    console.log(`${label}: player missing`);
    return;
  }
  console.log(`\n## ${label}`);
  console.log(`userId: ${args.userId}`);
  console.log(`player name: ${player.name}`);
  console.log(`level: ${player.level} / gold: ${player.gold}`);

  const mainRows = db.prepare(`
    SELECT job_name, job_level FROM player_job_levels WHERE user_id = ? AND job_name IN (${BASIC_MAIN_JOBS.map(() => '?').join(',')})
  `).all(args.userId, ...BASIC_MAIN_JOBS) as Array<{ job_name: string; job_level: number }>;
  console.log(`main jobs (${mainRows.length}/${BASIC_MAIN_JOBS.length}): ${mainRows.map((r) => `${r.job_name}Lv${r.job_level}`).join(', ')}`);

  const subRows = db.prepare(`
    SELECT job_name, job_level FROM player_job_levels WHERE user_id = ? AND job_name IN (${PHASE2_SUB_JOBS.map(() => '?').join(',')})
  `).all(args.userId, ...PHASE2_SUB_JOBS) as Array<{ job_name: string; job_level: number }>;
  console.log(`sub jobs (${subRows.length}/${PHASE2_SUB_JOBS.length}): ${subRows.map((r) => `${r.job_name}Lv${r.job_level}`).join(', ')}`);

  const eqCount = db.prepare(`
    SELECT COUNT(DISTINCT pi.item_id) c FROM player_inventory pi JOIN items i ON pi.item_id = i.id
    WHERE pi.user_id = ? AND i.category = 'equipment'
  `).get(args.userId) as { c: number };
  console.log(`equipment distinct: ${eqCount.c}`);

  const cleared = db.prepare(`
    SELECT COUNT(*) c FROM player_advanced_job_unlocks WHERE user_id = ? AND trial_cleared_at IS NOT NULL
  `).get(args.userId) as { c: number };
  console.log(`advanced trials cleared: ${cleared.c} (expected 0 when --trials-uncleared)`);

  const valhalla = db.prepare(`
    SELECT 1 FROM story_flags WHERE user_id = ? AND flag = 'valhalla_unlocked'
  `).get(args.userId);
  console.log(`valhalla_unlocked: ${valhalla ? 'YES' : 'NO'}`);
}

export { parseArgs, planChanges, applyChanges };

function main() {
  const args = parseArgs(process.argv.slice(2));
  const db = getDb();
  ensureMaterialsSeed(db);
  ensurePhase2Seed(db);
  ensureMasterDataSeed(db);

  const plan = planChanges(db, args);
  if ('error' in plan) {
    console.error(`ABORT: ${plan.error}`);
    process.exit(1);
  }

  console.log('# dev-grant-valhalla-test-loadout');
  const mode = args.verifyOnly ? 'VERIFY' : args.apply ? 'APPLY' : 'DRY-RUN';
  console.log(`mode: ${mode}`);
  console.log(`target userId: ${args.userId} (required key)`);
  console.log(`player name (DB): ${plan.player.name}`);
  if (args.expectedHandle) {
    const match = plan.player.name.toLowerCase().includes(args.expectedHandle.toLowerCase())
      || args.userId === '1512670896278470688';
    console.log(`expected-handle: ${args.expectedHandle} → ${match ? 'OK/warn-if-mismatch' : 'WARN: name mismatch'}`);
    if (!match) console.warn(`WARN: DB name "${plan.player.name}" does not resemble expected-handle "${args.expectedHandle}" — proceeding by userId only`);
  }

  printSummary(db, args, 'Current state');

  console.log('\n## Planned changes');
  console.log(`- level → ${args.level}, gold → ${args.gold}, exp → 0 (Lv${args.level}内進捗), total_exp → ${totalExpToReachLevel(args.level)}`);
  console.log(`- main jobs → Lv${args.mainJobLevel} (${plan.mainJobs.length} jobs incl. 巡礼者 — codebase has 9 mains not 8)`);
  console.log(`- sub jobs → Lv${args.subJobLevel} (${plan.subJobs.length} jobs incl. 繋ぎ手)`);
  console.log(`- equipment add: ${plan.toAdd.length} (playable ${plan.playableCount}, already owned ${plan.ownedCount})`);
  console.log(`- max enhance: ${args.maxEnhance ? 'equipment.max_upgrade_level' : 'skip'}`);
  console.log(`- max awaken: ${args.maxAwaken ? `MAX_AWAKENING_LEVEL=${MAX_AWAKENING_LEVEL}` : 'skip'}`);
  console.log(`- trials unlock flags: ${args.unlockTrials}`);
  console.log(`- trials uncleared (delete advanced unlocks): ${args.trialsUncleared}`);
  console.log('- auto equip: NO');
  console.log('- legacy/excluded: excluded via equipmentClassification (wpn_unique_silence excluded)');
  console.log('- acc_raid_random: included when equipment audit current_obtainable=YES');
  console.log(`- god-roll SSR+ armor/accessories: ${args.godRollSsrPlusArmorAccessories}`);

  if (args.verifyOnly) {
    console.log('\n## Verify (read-only)');
    printEquipmentVerify(db, args.userId);
    if (args.godRollSsrPlusArmorAccessories) printGodRollVerify(db, args.userId);
    printJobUiVerify(args.userId);
    return;
  }

  if (!args.apply) {
    console.log('\nDRY-RUN complete — no DB changes. Pass --apply to write.');
    return;
  }

  applyChanges(db, args);
  printSummary(db, args, 'After apply');
  console.log('\n## Post-apply verify');
  printEquipmentVerify(db, args.userId);
  if (args.godRollSsrPlusArmorAccessories) printGodRollVerify(db, args.userId);
  printJobUiVerify(args.userId);
  console.log('\nAPPLY complete.');
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('dev-grant-valhalla-test-loadout.ts')) {
  main();
}
