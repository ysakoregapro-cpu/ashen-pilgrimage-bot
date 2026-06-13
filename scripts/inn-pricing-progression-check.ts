/**
 * inn-pricing-progression-check.ts — 宿代が最高進行度町ティア基準であることを検証
 * npx tsx scripts/inn-pricing-progression-check.ts
 */
import { getDb } from '../src/db/database';
import { ensurePhase2Seed } from '../src/db/seedData/phase2Seed';
import { createPlayer } from '../src/systems/playerSystem';
import { unlockTown } from '../src/systems/playerSystem';
import { calcInnCost, getHighestUnlockedTownTier } from '../src/systems/innSystem';

const USER = 'inn-pricing-progression-check-user';
let failed = 0;
const fail = (msg: string) => { console.error(`FAIL: ${msg}`); failed++; };

function main() {
  const db = getDb();
  ensurePhase2Seed(db);
  db.prepare('DELETE FROM players WHERE user_id = ?').run(USER);
  db.prepare('DELETE FROM player_town_unlocks WHERE user_id = ?').run(USER);
  createPlayer(USER, 'g', 'InnTest', 'c');
  db.prepare('UPDATE players SET level = 30, current_town_id = ? WHERE user_id = ?').run('start_starfield', USER);

  const earlyCost = calcInnCost(USER, 'start_starfield');
  unlockTown(USER, 'dragonbone_valley');
  const tier = getHighestUnlockedTownTier(USER);
  if (tier < 40) fail(`expected tier >=40 after dragonbone unlock, got ${tier}`);

  const highProgressCost = calcInnCost(USER, 'start_starfield');
  if (highProgressCost <= earlyCost) {
    fail(`progression tier should raise cost: early=${earlyCost} high=${highProgressCost}`);
  }

  db.prepare('UPDATE players SET current_town_id = ? WHERE user_id = ?').run('twilight_port', USER);
  const stillHigh = calcInnCost(USER, 'twilight_port');
  if (stillHigh !== highProgressCost) {
    fail(`cost should not depend on current low-tier town: ${stillHigh} vs ${highProgressCost}`);
  }

  console.log(`OK: early=${earlyCost}G after dragonbone unlock=${highProgressCost}G (tier ${tier})`);
  if (failed) process.exit(1);
  console.log('PASS: inn-pricing-progression-check');
}

main();
