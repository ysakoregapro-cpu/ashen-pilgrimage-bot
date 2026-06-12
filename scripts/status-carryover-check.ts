/** status-carryover-check — npx tsx scripts/status-carryover-check.ts */
import { getDb } from '../src/db/database';
import { ensurePhase2Seed } from '../src/db/seedData/phase2Seed';
import { ensureMaterialsSeed } from '../src/db/seedData/materials';
import {
  setPlayerStatusEffect, getPlayerStatusEffects, clearPlayerStatusEffects,
  loadBattleStatusFromPlayer, syncBattleStatusToPlayer, applyExplorationStatusTick,
} from '../src/systems/playerStatusSystem';
import { restAtInn, shrineHeal } from '../src/systems/innSystem';
import { mergeStatusState, DEFAULT_STATUS_STATE } from '../src/systems/statusEffectSystem';
import { createPlayer, getPlayer, requirePlayer } from '../src/systems/playerSystem';

const TEST_USER = 'status-carryover-user';
const issues: string[] = [];

function main() {
  const db = getDb();
  ensureMaterialsSeed(db);
  ensurePhase2Seed(db);
  if (!getPlayer(TEST_USER)) createPlayer(TEST_USER, 'g', 'Test', 'c');

  clearPlayerStatusEffects(TEST_USER);
  setPlayerStatusEffect(TEST_USER, 'poison', 3);

  const loaded = loadBattleStatusFromPlayer(TEST_USER);
  if (!loaded.poisonTurns || loaded.poisonTurns < 1) issues.push('戦闘開始時に毒が読み込まれない');

  const state = mergeStatusState({ ...loaded, poisonTurns: 2 });
  syncBattleStatusToPlayer(TEST_USER, state);
  const persisted = getPlayerStatusEffects(TEST_USER).find((e) => e.effect_key === 'poison');
  if (!persisted || persisted.stacks !== 2) issues.push('戦闘後毒同期失敗');

  db.prepare('UPDATE players SET hp = 100, max_hp = 100, gold = 9999, current_town_id = ? WHERE user_id = ?').run('twilight_port', TEST_USER);
  const tick = applyExplorationStatusTick(TEST_USER);
  if (tick.damage < 1) issues.push('探索毒ダメージなし');
  const afterTick = requirePlayer(TEST_USER);
  if (afterTick.hp >= 100) issues.push('探索毒ダメージ未適用');

  setPlayerStatusEffect(TEST_USER, 'poison', 2);
  const inn = restAtInn(TEST_USER, 'twilight_port');
  if (!inn.ok && inn.reason !== 'already_full') { /* ok */ }
  if (getPlayerStatusEffects(TEST_USER).length) issues.push('宿屋後毒残存');

  setPlayerStatusEffect(TEST_USER, 'poison', 2);
  shrineHeal(TEST_USER, 'twilight_port');
  if (getPlayerStatusEffects(TEST_USER).length) issues.push('救護所後毒残存');

  const table = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='player_status_effects'`).get();
  if (!table) issues.push('player_status_effects テーブルなし');

  if (issues.length) {
    console.error('❌ status-carryover-check failed:');
    for (const i of issues) issues && console.error('  -', i);
    process.exit(1);
  }
  console.log('✅ status-carryover-check passed');
}

main();
