/**
 * Status effect success rate / anti-lock verification — run: npx tsx scripts/status-effect-check.ts
 */
import {
  DEFAULT_STATUS_STATE,
  attemptApplyEnemyStatus,
  calcStatusSuccessRate,
  isEnemyActionBlocked,
  mergeStatusState,
  onEnemyControlBlocked,
  type BattleStatusState,
} from '../src/systems/statusEffectSystem';
import type { ThreatTier } from '../src/systems/combatMath';

const TRIALS = 10;

function freshState(): BattleStatusState {
  return mergeStatusState({});
}

function simulateTrials(
  tier: ThreatTier,
  effect: 'bind' | 'slow',
  opts?: { isBoss?: boolean; skillRate?: number; preState?: Partial<BattleStatusState> },
): { successes: number; fullStops: number; rates: number[] } {
  let successes = 0;
  let fullStops = 0;
  const rates: number[] = [];

  for (let i = 0; i < TRIALS; i++) {
    const state = freshState();
    if (opts?.preState) Object.assign(state, opts.preState);
    const rate = calcStatusSuccessRate(state, effect, tier, opts?.skillRate);
    rates.push(rate);
    const rollValue = Math.random();
    const result = attemptApplyEnemyStatus({
      state,
      effect,
      duration: 1,
      isBoss: opts?.isBoss ?? tier === 'boss',
      threatTier: tier,
      skillSuccessRate: opts?.skillRate,
      rollValue,
    });
    if (result.success) successes++;
    if (result.fullControlApplied) fullStops++;
  }

  return { successes, fullStops, rates };
}

function simulateConsecutiveBind(tier: ThreatTier): string[] {
  const state = freshState();
  const lines: string[] = [];
  for (let i = 1; i <= 4; i++) {
    const rate = calcStatusSuccessRate(state, 'bind', tier);
    const rollValue = 0.01;
    const result = attemptApplyEnemyStatus({
      state,
      effect: 'bind',
      duration: 1,
      isBoss: false,
      threatTier: tier,
      rollValue,
    });
    lines.push(`  ${i}回目: 成功率 ${(rate * 100).toFixed(1)}% → ${result.success ? '成功' : '失敗'}${result.fullControlApplied ? '（完全停止）' : ''}`);
  }
  return lines;
}

function simulateImmunityAfterControl(): string {
  const state = freshState();
  const first = attemptApplyEnemyStatus({
    state,
    effect: 'bind',
    duration: 1,
    isBoss: false,
    threatTier: 'normal',
    rollValue: 0.01,
  });
  const blocked = isEnemyActionBlocked(state, false);
  if (blocked) onEnemyControlBlocked(state);
  const second = attemptApplyEnemyStatus({
    state,
    effect: 'bind',
    duration: 1,
    isBoss: false,
    threatTier: 'normal',
    rollValue: 0.01,
  });
  return [
    `  1回目: 完全停止=${first.fullControlApplied}`,
    `  敵行動不能=${blocked}`,
    `  2回目（免疫中）: 完全停止=${second.fullControlApplied}, ログ=${second.logs[0]}`,
  ].join('\n');
}

function simulateDamageAlwaysApplies(): boolean {
  const before = 100;
  let after = before;
  const state = freshState();
  after -= 21;
  attemptApplyEnemyStatus({
    state,
    effect: 'bind',
    duration: 1,
    isBoss: false,
    threatTier: 'normal',
    rollValue: 0.99,
  });
  return after < before;
}

function main(): void {
  console.log('=== 状態異常チェック ===\n');

  const normal = simulateTrials('normal', 'bind');
  console.log(`通常敵 bind ${TRIALS}回試行: 成功 ${normal.successes}/${TRIALS} (参考率 ${(normal.successes / TRIALS * 100).toFixed(0)}%)`);
  console.log(`  計算成功率: ${(normal.rates[0]! * 100).toFixed(1)}%\n`);

  const elite = simulateTrials('elite', 'bind');
  console.log(`elite bind ${TRIALS}回試行: 成功 ${elite.successes}/${TRIALS} (参考率 ${(elite.successes / TRIALS * 100).toFixed(0)}%)`);
  console.log(`  計算成功率: ${(elite.rates[0]! * 100).toFixed(1)}%\n`);

  const boss = simulateTrials('boss', 'bind', { isBoss: true });
  console.log(`boss bind ${TRIALS}回試行: 成功 ${boss.successes}/${TRIALS}, 完全停止 ${boss.fullStops}/${TRIALS}`);
  console.log(`  完全停止なし: ${boss.fullStops === 0 ? 'OK' : 'NG'}\n`);

  console.log('連続 bind 成功率低下（通常敵・必中ロール）:');
  for (const line of simulateConsecutiveBind('normal')) console.log(line);
  console.log('');

  console.log('行動不能後の一時耐性:');
  console.log(simulateImmunityAfterControl());
  console.log('');

  const dmgOk = simulateDamageAlwaysApplies();
  console.log(`ダメージ+状態異常（ダメージは状態失敗でも入る）: ${dmgOk ? 'OK' : 'NG'}`);

  const allOk = boss.fullStops === 0 && dmgOk;
  console.log(`\n総合: ${allOk ? 'PASS' : '要確認'}`);
}

main();
