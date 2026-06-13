/**
 * equipment-affix-balance-check.ts — Phase2.5 probability / distribution sanity
 */
import {
  AFFIX_KIND_WEIGHTS, SKILL_COUNT_WEIGHTS, SKILL_COUNT_WEIGHTS_VALHALLA_RAID,
  buildAffixEntry, rollAffixKind, rollSkillCount,
} from '../src/db/seedData/equipmentAffixMaster';

let failed = 0;
const fail = (msg: string) => { console.error(`FAIL: ${msg}`); failed++; };

function approx(actual: number, expected: number, tol: number, label: string) {
  if (Math.abs(actual - expected) > tol) fail(`${label}: got ${(actual * 100).toFixed(1)}% expected ~${(expected * 100).toFixed(1)}%`);
}

for (const [rarity, weights] of Object.entries(SKILL_COUNT_WEIGHTS)) {
  const total = weights.reduce((s, w) => s + w.weight, 0);
  if (Math.abs(total - 100) > 0.01 && Math.abs(total - 1) > 0.01) {
    fail(`${rarity} skill weights sum ${total}`);
  }
}
console.log('OK: skill count weight tables');

const kindTotal = AFFIX_KIND_WEIGHTS.reduce((s, k) => s + k.weight, 0);
const paramW = AFFIX_KIND_WEIGHTS.find((k) => k.kind === 'param')!.weight / kindTotal;
const drW = AFFIX_KIND_WEIGHTS.find((k) => k.kind === 'damage_reduction')!.weight / kindTotal;
const dealtW = AFFIX_KIND_WEIGHTS.find((k) => k.kind === 'damage_dealt')!.weight / kindTotal;
if (!(paramW > drW && drW > dealtW)) fail('kind order param > dr > dealt');
console.log(`OK: kind weights param ${(paramW * 100).toFixed(0)}% > dr ${(drW * 100).toFixed(0)}% > dealt ${(dealtW * 100).toFixed(0)}%`);

for (const rarity of ['SSR', 'UR']) {
  const counts = [0, 0, 0];
  const N = 10000;
  for (let i = 0; i < N; i++) counts[rollSkillCount(rarity, {}, () => Math.random())]++;
  const w = SKILL_COUNT_WEIGHTS[rarity]!;
  approx(counts[0] / N, w.find((x) => x.count === 0)!.weight / 100, 0.03, `${rarity} 0-skills`);
  approx(counts[1] / N, w.find((x) => x.count === 1)!.weight / 100, 0.03, `${rarity} 1-skills`);
  approx(counts[2] / N, w.find((x) => x.count === 2)!.weight / 100, 0.03, `${rarity} 2-skills`);
}
console.log('OK: SSR/UR skill count Monte Carlo');

for (const rarity of ['SSR', 'UR']) {
  const w = SKILL_COUNT_WEIGHTS_VALHALLA_RAID[rarity]!;
  const sum = w.reduce((s, x) => s + x.weight, 0);
  if (Math.abs(sum - 100) > 0.01) fail(`valhalla/raid ${rarity} weights`);
}
console.log('OK: valhalla/raid skill weights');

const kinds = { param: 0, damage_reduction: 0, damage_dealt: 0 };
for (let i = 0; i < 5000; i++) kinds[rollAffixKind(() => Math.random())]++;
const totalK = kinds.param + kinds.damage_reduction + kinds.damage_dealt;
approx(kinds.param / totalK, 0.72, 0.04, 'param kind roll');
console.log('OK: affix kind Monte Carlo');

let highDrawback = 0;
let highTotal = 0;
for (let i = 0; i < 3000; i++) {
  const a = buildAffixEntry('param', 'UR', new Set(), ['attack_percent', 'hp_percent'], () => Math.random());
  if (a.value >= 4.5) {
    highTotal++;
    if (a.drawbackKey && a.drawbackValue > 0) highDrawback++;
  }
}
if (highTotal > 100) approx(highDrawback / highTotal, 0.8, 0.08, '4.5%+ drawback');
console.log('OK: high-value drawback design');

if (failed) { console.error(`\n${failed} failure(s)`); process.exit(1); }
console.log('\nAll equipment-affix-balance-check passed.');
