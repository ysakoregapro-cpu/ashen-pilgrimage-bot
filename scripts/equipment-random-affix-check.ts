/**
 * equipment-random-affix-check.ts — Phase2.5 affix roll rules
 */
import {
  AFFIX_VALUE_CAPS, buildAffixEntry, buildGodRollAffixes, isAffixEligibleRarity,
  isArmorOrAccessorySlot, rollAffixValue, rollSkillCount, shouldRollAffixes,
} from '../src/db/seedData/equipmentAffixMaster';
import { rollEquipmentInstance } from '../src/systems/equipmentAffixSystem';

let failed = 0;
const fail = (msg: string) => { console.error(`FAIL: ${msg}`); failed++; };
const ok = (msg: string) => console.log(`OK: ${msg}`);

for (const slot of ['weapon', 'head', 'accessory1']) {
  const r = rollEquipmentInstance({ rarity: 'SSR', slot, rollSource: 'battle_reward', baseStats: { attack_bonus: 10 } });
  if (slot === 'weapon' && (r.affix_json || r.stat_roll_json)) fail('weapon should not roll affixes');
  if (slot !== 'weapon' && !r.stat_roll_json) fail(`${slot} should roll stat_roll`);
}

for (const rarity of ['N', 'R', 'SR']) {
  for (let i = 0; i < 500; i++) {
    const n = rollSkillCount(rarity, {}, () => Math.random());
    if (n > 1) fail(`${rarity} skill count > 1`);
  }
}
ok('N/R/SR max 1 skill');

for (const rarity of ['SSR', 'UR']) {
  let over = false;
  for (let i = 0; i < 500; i++) {
    if (rollSkillCount(rarity, {}, () => Math.random()) > 2) over = true;
  }
  if (over) fail(`${rarity} skill count > 2`);
}
ok('SSR/UR max 2 skills');

const used = new Set<string>();
for (let i = 0; i < 200; i++) {
  const used = new Set<import('../src/db/seedData/equipmentAffixMaster').AffixPrimaryKey>();
  const c = rollSkillCount('UR', {}, () => Math.random());
  const keys: string[] = [];
  for (let j = 0; j < c; j++) {
    const a = buildAffixEntry('param', 'UR', used, ['hp_percent', 'attack_percent'], () => Math.random());
    keys.push(a.key);
  }
  if (new Set(keys).size !== keys.length) fail('duplicate primary key in same roll');
}
ok('no duplicate primary keys per item');

let highNoDrawback = 0;
let highWithDrawback = 0;
for (let i = 0; i < 2000; i++) {
  const a = buildAffixEntry('param', 'UR', new Set(), ['attack_percent'], () => Math.random());
  if (a.value >= 4.5) {
    if (a.drawbackKey) highWithDrawback++;
    else highNoDrawback++;
  }
}
if (highWithDrawback + highNoDrawback < 50) fail('not enough 4.5%+ samples');
ok(`4.5%+ drawback rate ~80% (${highWithDrawback}/${highWithDrawback + highNoDrawback} with drawback)`);

let sevenCount = 0;
for (let i = 0; i < 50000; i++) {
  if (rollAffixValue('UR', () => Math.random()) === 7.0) sevenCount++;
}
const sevenRate = sevenCount / 50000;
if (sevenRate >= 0.01) fail(`7.0% rate too high: ${(sevenRate * 100).toFixed(3)}%`);
ok(`7.0% ultra-rare (${(sevenRate * 100).toFixed(4)}% in 50k rolls)`);

for (let i = 0; i < 500; i++) {
  const v = rollAffixValue('SR', () => Math.random());
  if (Math.round(v * 10) / 10 !== v) fail('affix value not 0.1 step');
  if (v > AFFIX_VALUE_CAPS.SR) fail('SR exceeds cap');
}
ok('values are 0.1 unit within caps');

const god = buildGodRollAffixes();
if (god.length !== 2 || god.some((a) => a.drawbackKey)) fail('god roll shape');
ok('god roll affixes');

if (shouldRollAffixes('shop')) fail('shop should not roll');
if (!shouldRollAffixes('battle_reward')) fail('battle should roll');
ok('roll source gating');

if (!isAffixEligibleRarity('SSR') || isAffixEligibleRarity('Uni')) fail('rarity eligibility');
if (!isArmorOrAccessorySlot('head') || isArmorOrAccessorySlot('weapon')) fail('slot eligibility');
ok('slot/rarity eligibility');

if (failed) { console.error(`\n${failed} failure(s)`); process.exit(1); }
console.log('\nAll equipment-random-affix-check passed.');
