/** reward-balance-check — npx tsx scripts/reward-balance-check.ts */
import { REWARD_SCALE_BY_TYPE, getBattleRewardMultipliers } from '../src/systems/enemyBalanceV2';
import { initAuditDb } from './audit/acquisitionIndex';

const warns: string[] = [];
const fails: string[] = [];

function main() {
  initAuditDb();

  console.log('## REWARD_SCALE_BY_TYPE\n');
  for (const [k, v] of Object.entries(REWARD_SCALE_BY_TYPE)) {
    console.log(`- ${k}: ×${v}`);
  }

  const cases: Array<{ label: string; opts: Parameters<typeof getBattleRewardMultipliers>[0]; minExp: number; minGold: number }> = [
    { label: 'normal', opts: { threatTier: 'normal', areaTag: 'starfield', isBoss: false, isRematch: false }, minExp: 1.0, minGold: 1.0 },
    { label: 'tough', opts: { threatTier: 'tough', areaTag: 'port', isBoss: false, isRematch: false }, minExp: 1.1, minGold: 1.15 },
    { label: 'rare', opts: { threatTier: 'rare', areaTag: 'forest', isBoss: false, isRematch: false }, minExp: 1.2, minGold: 1.3 },
    { label: 'elite', opts: { threatTier: 'elite', areaTag: 'capital', isBoss: false, isRematch: false }, minExp: 1.3, minGold: 1.5 },
    { label: 'boss', opts: { threatTier: 'boss', areaTag: 'furnace', isBoss: true, isRematch: false }, minExp: 1.4, minGold: 1.6 },
    { label: 'valhalla', opts: { threatTier: 'normal', areaTag: 'valhalla', isBoss: false, isRematch: false }, minExp: 1.5, minGold: 1.7 },
    { label: 'raid', opts: { threatTier: 'boss', areaTag: 'valhalla', isBoss: true, isRematch: false, isRaid: true }, minExp: 1.5, minGold: 1.8 },
    { label: 'rematch', opts: { threatTier: 'boss', areaTag: 'furnace', isBoss: true, isRematch: true }, minExp: 0.5, minGold: 0.5 },
  ];

  console.log('\n## getBattleRewardMultipliers samples\n');
  console.log('| type | expMult | goldMult |');
  console.log('| --- | --- | --- |');
  for (const c of cases) {
    const m = getBattleRewardMultipliers(c.opts);
    console.log(`| ${c.label} | ${m.expMult.toFixed(2)} | ${m.goldMult.toFixed(2)} |`);
    if (m.expMult < c.minExp) warns.push(`${c.label} expMult ${m.expMult.toFixed(2)} < ${c.minExp}`);
    if (m.goldMult < c.minGold) warns.push(`${c.label} goldMult ${m.goldMult.toFixed(2)} < ${c.minGold}`);
  }

  // EXP should not exceed raid gold ratio too much (Lv100 grind guard)
  const normalExp = getBattleRewardMultipliers({ threatTier: 'normal', areaTag: 'starfield', isBoss: false, isRematch: false }).expMult;
  const raidExp = getBattleRewardMultipliers({ threatTier: 'boss', areaTag: 'valhalla', isBoss: true, isRematch: false, isRaid: true }).expMult;
  if (raidExp / normalExp > 2.5) {
    warns.push(`raid/normal exp ratio ${(raidExp / normalExp).toFixed(2)} > 2.5 (Lv100 grind)`);
  }

  const party2 = getBattleRewardMultipliers({
    threatTier: 'normal', areaTag: 'forest', isBoss: false, isRematch: false, partyRewardMult: 1.15,
  });
  if (party2.expMult <= normalExp) {
    fails.push('2体報酬倍率が反映されていない');
  }

  console.log('\n## WARN');
  for (const w of warns) console.log(`- ${w}`);
  if (!warns.length) console.log('(なし)');

  if (fails.length) {
    console.error('\n## FAIL');
    for (const f of fails) console.error(`- ${f}`);
    process.exit(1);
  }
  console.log('\n✅ reward-balance-check passed');
}

main();
