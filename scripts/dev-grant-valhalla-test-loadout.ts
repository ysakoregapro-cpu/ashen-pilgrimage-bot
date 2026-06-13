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
import { setStoryFlag } from '../src/systems/storySystem';
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
  apply: boolean;
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
    apply: has('--apply'),
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

  for (const baseJob of Object.keys(JOB_TRIO_MAP)) {
    db.prepare(`
      INSERT INTO player_job_levels (user_id, job_name, job_level, job_exp, is_main, is_sub, unlocked_at, updated_at)
      VALUES (?, ?, ?, 0, 1, 0, ?, ?)
      ON CONFLICT(user_id, job_name) DO UPDATE SET job_level = excluded.job_level, job_exp = 0, updated_at = excluded.updated_at
    `).run(args.userId, baseJob, args.mainJobLevel, ts, ts);

    const sub = JOB_TRIO_MAP[baseJob]!.sub;
    unlockSubJob(args.userId, sub, 'dev_valhalla_test_loadout');
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

export { parseArgs, planChanges, applyChanges, type Args };

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
  console.log(`mode: ${args.apply ? 'APPLY' : 'DRY-RUN'}`);
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
  console.log('- legacy/excluded: excluded via equipmentClassification');

  if (!args.apply) {
    console.log('\nDRY-RUN complete — no DB changes. Pass --apply to write.');
    return;
  }

  applyChanges(db, args);
  printSummary(db, args, 'After apply');
  console.log('\nAPPLY complete.');
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('dev-grant-valhalla-test-loadout.ts')) {
  main();
}
