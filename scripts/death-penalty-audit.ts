/** death-penalty-audit.ts — npx tsx scripts/death-penalty-audit.ts */
import fs from 'fs';
import path from 'path';
import { getDb } from '../src/db/database';
import { ensurePhase2Seed } from '../src/db/seedData/phase2Seed';
import { createPlayer, getPlayer } from '../src/systems/playerSystem';
import { applyDefeat, applyTrialDefeat } from '../src/systems/defeatSystem';
import { emptyResult, exitCheckResult, writeMdCsvPair } from './balance/balanceHelpers';

const USER = 'death-penalty-audit-user';
let rngCalls = 0;
const originalRandom = Math.random;

function reset(db: ReturnType<typeof getDb>) {
  db.prepare('DELETE FROM durability_logs WHERE user_id = ?').run(USER);
  db.prepare('DELETE FROM player_equipment WHERE user_id = ?').run(USER);
  db.prepare('DELETE FROM player_inventory WHERE user_id = ?').run(USER);
  db.prepare('DELETE FROM players WHERE user_id = ?').run(USER);
}

function main() {
  const result = emptyResult();
  const db = getDb();
  ensurePhase2Seed(db);
  reset(db);
  createPlayer(USER, 'g', 'DeathTest', 'c');
  db.prepare('UPDATE players SET gold = 1000, current_town_id = ?, last_safe_town_id = ? WHERE user_id = ?')
    .run('start_starfield', 'start_starfield', USER);

  const eqRow = db.prepare('SELECT item_id FROM equipment LIMIT 1').get() as { item_id: string } | undefined;
  if (eqRow) {
    db.prepare(`
      INSERT INTO player_inventory (user_id, item_id, quantity, durability_state, created_at, updated_at)
      VALUES (?, ?, 1, '良好', datetime('now'), datetime('now'))
    `).run(USER, eqRow.item_id);
    const inv = db.prepare('SELECT id FROM player_inventory WHERE user_id = ?').get(USER) as { id: number };
    db.prepare('INSERT INTO player_equipment (user_id, inventory_id, slot) VALUES (?, ?, ?)').run(USER, inv.id, 'head');
  }

  const src = fs.readFileSync(path.join(process.cwd(), 'src/systems/defeatSystem.ts'), 'utf8');
  if (!/Math\.random\(\)\s*>\s*0\.5/.test(src)) {
    result.fails.push('defeatSystem に50%装備損傷ロールが見つからない');
  }

  let hitCount = 0;
  Math.random = () => { rngCalls++; return 0.4; };
  for (let i = 0; i < 20; i++) {
    db.prepare('UPDATE player_inventory SET durability_state = ? WHERE user_id = ?').run('良好', USER);
    db.prepare('DELETE FROM durability_logs WHERE user_id = ?').run(USER);
    applyDefeat(USER, false, null);
    const log = db.prepare('SELECT COUNT(*) AS c FROM durability_logs WHERE user_id = ?').get(USER) as { c: number };
    hitCount += log.c > 0 ? 1 : 0;
  }
  Math.random = originalRandom;
  if (hitCount !== 20) result.fails.push(`50%未満ロールでも損傷: hits=${hitCount}/20`);
  if (hitCount === 20) {
    /* all 20 rolls with 0.4 should always worsen */
  }

  const goldBeforeTrial = getPlayer(USER)!.gold;
  const durBeforeTrial = (db.prepare('SELECT COUNT(*) AS c FROM durability_logs WHERE user_id = ?').get(USER) as { c: number }).c;
  applyTrialDefeat(USER);
  if (getPlayer(USER)!.gold !== goldBeforeTrial) result.fails.push('試練敗北でGold没収');
  const durAfterTrial = (db.prepare('SELECT COUNT(*) AS c FROM durability_logs WHERE user_id = ?').get(USER) as { c: number }).c;
  if (durAfterTrial > durBeforeTrial) result.fails.push('試練敗北で装備損傷');

  writeMdCsvPair(
    'death-penalty-audit',
    ['check', 'status', 'detail'],
    [
      ['equip_damage_50pct_code', /Math\.random\(\)\s*>\s*0\.5/.test(src) ? 'OK' : 'FAIL', 'defeatSystem'],
      ['equip_damage_on_low_roll', hitCount === 20 ? 'OK' : 'FAIL', `${hitCount}/20`],
      ['trial_defeat_no_gold', getPlayer(USER)!.gold === goldBeforeTrial ? 'OK' : 'FAIL', ''],
      ['trial_defeat_no_durability', durAfterTrial === durBeforeTrial ? 'OK' : 'FAIL', `${durBeforeTrial}->${durAfterTrial}`],
    ],
    ['## Summary', '', '通常敗北: 装備は部位50%で劣化', '試練敗北: Gold/装備ペナルティなし'],
  );

  exitCheckResult('death-penalty-audit', result);
}

main();
