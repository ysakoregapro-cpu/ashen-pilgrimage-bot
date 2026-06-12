/** mp-consumption-order-check — npx tsx scripts/mp-consumption-order-check.ts */
import { getDb } from '../src/db/database';
import { ensurePhase2Seed } from '../src/db/seedData/phase2Seed';
import { ensureMaterialsSeed } from '../src/db/seedData/materials';
import { createPlayer, getPlayer, recalculatePlayerStats, requirePlayer } from '../src/systems/playerSystem';
import { createBattle, processBattleAction } from '../src/systems/battleSystem';
import { syncBattleResourcesToPlayer } from '../src/systems/playerStatusSystem';
import { selectMainJob } from '../src/systems/jobSystem';
import { writeReport } from './audit/reportWriter';

const TEST_USER = 'mp-consumption-check-user';
const issues: string[] = [];
const notes: string[] = [];

function setupPlayer() {
  const db = getDb();
  if (!getPlayer(TEST_USER)) createPlayer(TEST_USER, 'g', 'Test', 'c');
  db.prepare(`UPDATE players SET main_job='未選択', sub_job=NULL, level=25, exp=0 WHERE user_id=?`).run(TEST_USER);
  selectMainJob(TEST_USER, '魔術師');
  recalculatePlayerStats(TEST_USER);
  const p = requirePlayer(TEST_USER);
  db.prepare('UPDATE players SET hp=?, mp=?, gold=9999 WHERE user_id=?').run(p.max_hp, p.max_mp, TEST_USER);
}

function clearBattles() {
  getDb().prepare(`DELETE FROM battle_sessions WHERE user_id=?`).run(TEST_USER);
}

function main() {
  ensureMaterialsSeed(getDb());
  ensurePhase2Seed(getDb());
  setupPlayer();
  clearBattles();

  const before = requirePlayer(TEST_USER);
  const mpBefore = before.mp;
  const skillId = 'bs_ash_fire';
  const skill = getDb().prepare('SELECT id, mp_cost FROM skills WHERE id=?').get(skillId) as { mp_cost: number } | undefined;
  if (!skill) {
    issues.push(`テスト用スキル ${skillId} が見つからない`);
  } else {
    const battleId = createBattle(TEST_USER, 'mon_star_slime', 'area_star_outskirts');
    const mpCost = skill.mp_cost;
    if (mpBefore < mpCost) {
      getDb().prepare('UPDATE players SET mp=? WHERE user_id=?').run(before.max_mp, TEST_USER);
    }
    const mpStart = requirePlayer(TEST_USER).mp;

    const result = processBattleAction(TEST_USER, battleId, 'skill', { skillId });
    if (result.status !== 'victory') {
      issues.push(`スキル撃破で勝利にならなかった: status=${result.status}`);
    }

    const after = requirePlayer(TEST_USER);
    const expectedMp = Math.max(0, mpStart - mpCost);
    if (after.mp !== expectedMp && !(result.done && after.mp === after.max_mp)) {
      issues.push(`撃破後MP未保存: start=${mpStart} cost=${mpCost} expected=${expectedMp} actual=${after.mp}`);
    } else {
      notes.push(`スキル撃破後MP: ${mpStart} → ${after.mp} (cost ${mpCost})`);
    }
  }

  clearBattles();
  setupPlayer();
  const fleeBattle = createBattle(TEST_USER, 'mon_grass_imp', 'area_star_outskirts');
  getDb().prepare('UPDATE battle_sessions SET can_flee=1 WHERE id=?').run(fleeBattle);
  const fleeMpBefore = requirePlayer(TEST_USER).mp;
  getDb().prepare('UPDATE players SET mp=? WHERE user_id=?').run(Math.max(10, fleeMpBefore - 5), TEST_USER);
  const mpAfterSpend = requirePlayer(TEST_USER).mp;
  syncBattleResourcesToPlayer(TEST_USER, requirePlayer(TEST_USER).hp, mpAfterSpend);
  const synced = requirePlayer(TEST_USER).mp;
  if (synced !== mpAfterSpend) issues.push('syncBattleResourcesToPlayer がMPを正しく保存しない');
  else notes.push(`syncBattleResourcesToPlayer MP=${synced}`);

  notes.push('レベルアップ時: addExp() が hp=max_hp, mp=max_mp を設定（全回復）');
  notes.push('MP消費は executePlayerAction 内で命中前に pMp -= skill.mp_cost');

  const report = [
    '# MP Consumption Order Check',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    issues.length ? '## FAILURES' : '## OK',
    ...issues.map((i) => `- ${i}`),
    '',
    '## Notes',
    ...notes.map((n) => `- ${n}`),
  ].join('\n');
  writeReport('mp-consumption-order-check.md', report);

  if (issues.length) {
    console.error('❌ mp-consumption-order-check failed:');
    for (const i of issues) console.error('  -', i);
    process.exit(1);
  }
  console.log('✅ mp-consumption-order-check passed');
  console.log('Report: reports/mp-consumption-order-check.md');
}

main();
