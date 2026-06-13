/** valhalla-test-loadout-check — npx tsx scripts/valhalla-test-loadout-check.ts */
import { getDb } from '../src/db/database';
import { ensureMaterialsSeed } from '../src/db/seedData/materials';
import { ensurePhase2Seed } from '../src/db/seedData/phase2Seed';
import { ensureMasterDataSeed } from '../src/db/seedData/masterDataSeed';
import { createPlayer, getPlayer } from '../src/systems/playerSystem';
import { BASIC_MAIN_JOBS, PHASE2_SUB_JOBS } from '../src/db/seedData/jobMultiplierMaster';
import { MAX_AWAKENING_LEVEL, AWAKENING_ELIGIBLE_RARITIES } from '../src/db/seedData/awakeningMaster';
import { totalExpToReachLevel } from '../src/systems/expSystem';
import { EXCLUDED_EQUIPMENT } from '../src/db/seedData/equipmentClassification';
import { runEquipmentAcquisitionAudit } from '../src/systems/equipmentAcquisitionAudit';
import { applyChanges, planChanges, type Args } from './dev-grant-valhalla-test-loadout';

const TEST_USER = 'valhalla-loadout-check-user';
const fails: string[] = [];

function assert(cond: boolean, msg: string) {
  if (!cond) fails.push(msg);
}

function snapshot(userId: string) {
  const db = getDb();
  const p = getPlayer(userId)!;
  const eq = db.prepare(`
    SELECT COUNT(DISTINCT pi.item_id) c FROM player_inventory pi JOIN items i ON pi.item_id = i.id
    WHERE pi.user_id = ? AND i.category = 'equipment'
  `).get(userId) as { c: number };
  const cleared = db.prepare(`
    SELECT COUNT(*) c FROM player_advanced_job_unlocks WHERE user_id = ? AND trial_cleared_at IS NOT NULL
  `).get(userId) as { c: number };
  return { level: p.level, gold: p.gold, eq: eq.c, cleared: cleared.c };
}

function main() {
  const db = getDb();
  ensureMaterialsSeed(db);
  ensurePhase2Seed(db);
  ensureMasterDataSeed(db);

  if (!getPlayer(TEST_USER)) {
    createPlayer(TEST_USER, 'valhalla-check-guild', 'ValhallaCheck', 'ch-test');
  }

  const args: Args = {
    userId: TEST_USER,
    expectedHandle: 'ValhallaCheck',
    level: 80,
    gold: 999999,
    mainJobLevel: 70,
    subJobLevel: 70,
    allEquipment: true,
    maxEnhance: true,
    maxAwaken: true,
    unlockTrials: true,
    trialsUncleared: true,
    apply: false,
  };

  const before = snapshot(TEST_USER);
  planChanges(db, args);
  const afterDry = snapshot(TEST_USER);
  assert(before.level === afterDry.level, 'dry-run changed player level');
  assert(before.gold === afterDry.gold, 'dry-run changed gold');
  assert(before.eq === afterDry.eq, 'dry-run changed equipment count');

  applyChanges(db, { ...args, apply: true });

  const p = getPlayer(TEST_USER)!;
  assert(p.level === 80, `level ${p.level} !== 80`);
  assert(p.gold === 999999, `gold ${p.gold} !== 999999`);
  assert(p.total_exp === totalExpToReachLevel(80), `total_exp ${p.total_exp} !== Lv80 floor ${totalExpToReachLevel(80)}`);
  assert(p.exp === 0, `exp should be 0 at Lv80 floor, got ${p.exp}`);

  for (const job of BASIC_MAIN_JOBS) {
    const row = db.prepare('SELECT job_level FROM player_job_levels WHERE user_id = ? AND job_name = ?').get(TEST_USER, job) as { job_level: number } | undefined;
    assert(row?.job_level === 70, `main ${job} not Lv70`);
  }
  for (const job of PHASE2_SUB_JOBS) {
    const row = db.prepare('SELECT job_level FROM player_job_levels WHERE user_id = ? AND job_name = ?').get(TEST_USER, job) as { job_level: number } | undefined;
    assert(row?.job_level === 70, `sub ${job} not Lv70`);
  }

  const { rows } = runEquipmentAcquisitionAudit(db);
  const playable = rows.filter((r) => r.current_obtainable === 'YES' && !EXCLUDED_EQUIPMENT[r.item_id]);
  for (const r of playable) {
    const owned = db.prepare(`
      SELECT 1 FROM player_inventory WHERE user_id = ? AND item_id = ? LIMIT 1
    `).get(TEST_USER, r.item_id);
    assert(!!owned, `missing playable equipment ${r.item_id}`);
  }

  for (const ex of Object.keys(EXCLUDED_EQUIPMENT)) {
    const bad = db.prepare('SELECT 1 FROM player_inventory WHERE user_id = ? AND item_id = ?').get(TEST_USER, ex);
    assert(!bad, `legacy equipment added: ${ex}`);
  }

  const maxRows = db.prepare(`
    SELECT pi.item_id, pi.upgrade_level, pi.awakening_level, pi.durability_state, pi.is_equipped, e.max_upgrade_level, i.rarity
    FROM player_inventory pi
    JOIN equipment e ON pi.item_id = e.item_id
    JOIN items i ON pi.item_id = i.id
    WHERE pi.user_id = ?
  `).all(TEST_USER) as Array<{ item_id: string; upgrade_level: number; awakening_level: number; durability_state: string; is_equipped: number; max_upgrade_level: number; rarity: string }>;

  for (const row of maxRows) {
    assert(row.durability_state === '良好', `${row.item_id} durability not 良好`);
    assert(row.upgrade_level === row.max_upgrade_level, `${row.item_id} not max enhance`);
    if (AWAKENING_ELIGIBLE_RARITIES.has(row.rarity)) {
      assert(row.awakening_level === MAX_AWAKENING_LEVEL, `${row.item_id} not max awaken`);
    }
    assert(row.is_equipped === 0 || row.item_id === 'wpn_traveler_sword', `${row.item_id} auto-equipped by script`);
  }

  const cleared = db.prepare(`
    SELECT COUNT(*) c FROM player_advanced_job_unlocks WHERE user_id = ? AND trial_cleared_at IS NOT NULL
  `).get(TEST_USER) as { c: number };
  assert(cleared.c === 0, 'advanced job trial cleared when should be uncleared');

  const val = db.prepare(`
    SELECT 1 FROM story_flags WHERE user_id = ? AND flag = 'valhalla_unlocked'
  `).get(TEST_USER);
  assert(!!val, 'valhalla not unlocked');

  console.log('## valhalla-test-loadout-check\n');
  if (fails.length) {
    console.error('FAIL');
    for (const f of fails) console.error(`- ${f}`);
    process.exit(1);
  }
  console.log(`OK — dry-run no-op; apply sets Lv80/999999G; ${BASIC_MAIN_JOBS.length}+${PHASE2_SUB_JOBS.length} jobs Lv70; playable gear max enhance/awaken; trials unlocked uncleared`);
}

main();
