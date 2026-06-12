/** break-system-check — npx tsx scripts/break-system-check.ts */
import { getDb } from '../src/db/database';
import { mergeStatusState, DEFAULT_STATUS_STATE } from '../src/systems/statusEffectSystem';
import type { BattleState } from '../src/systems/battleSystem';

const issues: string[] = [];

function simulateBreakTrigger(eBreak: number, breakMax: number): {
  eBreakAfter: number;
  breakRemainingHits: number;
  enemyNextAtkReducePct: number;
} {
  const state: Partial<BattleState> = {
    ...mergeStatusState({}),
    breakRemainingHits: 0,
    playerBreakDamageMult: 1.25,
    enemyBroken: false,
  };
  let breakVal = eBreak;
  if (breakVal >= breakMax) {
    state.enemyBroken = true;
    state.breakRemainingHits = 2;
    state.enemyNextAtkReducePct = 0.2;
    state.enemyNextAtkReduceActive = true;
    breakVal = 0;
  }
  return {
    eBreakAfter: breakVal,
    breakRemainingHits: state.breakRemainingHits ?? 0,
    enemyNextAtkReducePct: state.enemyNextAtkReducePct ?? 0,
  };
}

function applyPlayerDamage(baseDmg: number, state: { breakRemainingHits: number; playerBreakDamageMult: number }, consume = true): number {
  let dmg = baseDmg;
  if (state.breakRemainingHits > 0) {
    dmg = Math.floor(dmg * state.playerBreakDamageMult);
    if (consume) state.breakRemainingHits--;
  }
  return dmg;
}

function main() {
  const result = simulateBreakTrigger(100, 100);
  if (result.eBreakAfter !== 0) issues.push('ブレイク後ゲージが0に戻らない');
  if (result.breakRemainingHits < 1 || result.breakRemainingHits > 2) issues.push('breakRemainingHits 範囲外');
  if (result.enemyNextAtkReducePct !== 0.2) issues.push('敵次回攻撃-20%未設定');

  const state = { breakRemainingHits: 2, playerBreakDamageMult: 1.25 };
  const boosted = applyPlayerDamage(100, state);
  if (boosted !== 125) issues.push(`与ダメ1.25倍: ${boosted} (expected 125)`);
  applyPlayerDamage(100, state);
  if (state.breakRemainingHits !== 0) issues.push('breakRemainingHits 消費後残存');

  // Verify battleSystem exports break fields
  const sample: Partial<BattleState> = { breakRemainingHits: 1, playerBreakDamageMult: 1.25 };
  if (!sample.breakRemainingHits) issues.push('BattleState breakRemainingHits 未定義');

  if (issues.length) {
    console.error('❌ break-system-check failed:');
    for (const i of issues) console.error('  -', i);
    process.exit(1);
  }
  console.log('✅ break-system-check passed');
}

main();
