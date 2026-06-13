/**
 * equipped-affix-profile-check.ts — プロフィール厳選効果表示の最小監査
 * npx tsx scripts/equipped-affix-profile-check.ts
 */
import fs from 'fs';
import path from 'path';
import {
  PARAM_AFFIX_KEYS,
  type AffixPrimaryKey,
  type EquipmentAffixEntry,
} from '../src/db/seedData/equipmentAffixMaster';
import {
  PROFILE_AFFIX_LABELS,
  buildEquipmentAffixSummary,
  formatAffixSummaryText,
  formatEquippedAffixProfileFromRows,
  type EquippedSummaryInput,
} from '../src/systems/equipmentAffixSystem';

let failed = 0;
const fail = (msg: string) => {
  console.error(`FAIL: ${msg}`);
  failed++;
};

const COMBAT_KEYS: AffixPrimaryKey[] = ['damage_dealt_percent', 'damage_taken_reduction_percent'];
const ALL_PRIMARY_KEYS: AffixPrimaryKey[] = [...PARAM_AFFIX_KEYS, ...COMBAT_KEYS];

for (const key of ALL_PRIMARY_KEYS) {
  if (!PROFILE_AFFIX_LABELS[key]) fail(`PROFILE_AFFIX_LABELS missing ${key}`);
}
console.log('OK: profile labels cover all affix primary keys');

function baseRow(slot: string, affixes: EquipmentAffixEntry[], statRollJson?: { quality: number; multipliers: Record<string, number> }): EquippedSummaryInput {
  return {
    slot,
    itemName: `test_${slot}`,
    upgrade_level: 0,
    src_level: 0,
    durability_state: '良好',
    attack_bonus: slot === 'arms' ? 20 : 0,
    magic_bonus: 0,
    defense_bonus: slot === 'head' ? 40 : slot === 'legs' ? 30 : 0,
    spirit_bonus: 0,
    speed_bonus: slot === 'feet' ? 15 : 0,
    hp_bonus: slot === 'body' ? 100 : 0,
    mp_bonus: 0,
    crit_rate_bonus: 0,
    weapon_type: slot === 'weapon' ? 'sword' : null,
    rarity: 'SSR',
    affixes,
    statRoll: statRollJson ?? null,
  };
}

const sampleAffix = (key: AffixPrimaryKey, value: number, drawback?: Partial<EquipmentAffixEntry>): EquipmentAffixEntry => ({
  key,
  label: PROFILE_AFFIX_LABELS[key],
  value,
  drawbackKey: drawback?.drawbackKey ?? null,
  drawbackValue: drawback?.drawbackValue ?? 0,
});

const bodyAffixes: EquipmentAffixEntry[] = [
  sampleAffix('hp_percent', 5),
  sampleAffix('damage_taken_reduction_percent', 3),
];
const legsAffixes: EquipmentAffixEntry[] = [sampleAffix('hp_percent', 3)];
const feetAffixes: EquipmentAffixEntry[] = [
  sampleAffix('speed_percent', 4, { drawbackKey: 'speed_down_percent', drawbackValue: 2 }),
];
const armsAffixes: EquipmentAffixEntry[] = [sampleAffix('damage_dealt_percent', 2)];

const rows: EquippedSummaryInput[] = [
  baseRow('body', bodyAffixes, { quality: 1, multipliers: { hp: 1.1 } }),
  baseRow('legs', legsAffixes),
  baseRow('feet', feetAffixes),
  baseRow('arms', armsAffixes),
  baseRow('head', [], { quality: 1, multipliers: { defense: 1.2 } }),
];

const block = formatEquippedAffixProfileFromRows(rows);
if (block === 'なし') fail('expected affix block for sample rows');
if (!block.includes('個体差ボーナス:')) fail(`expected stat roll section, got:\n${block}`);
if (!block.includes('ランダム特性:')) fail(`expected affix section, got:\n${block}`);
if (!block.includes('最大HP +8.0%')) fail(`expected total HP +8%, got:\n${block}`);
if (!block.includes('被ダメージ -3.0%')) fail(`expected body taken -3%, got:\n${block}`);
if (!block.includes('与ダメージ +2.0%')) fail(`expected arms dealt +2%, got:\n${block}`);
if (!block.includes('デメリット:')) fail(`expected drawback section, got:\n${block}`);
if (!block.includes('速度 -2.0%')) fail(`expected speed drawback, got:\n${block}`);
if (!block.includes('【部位別】')) fail('expected slot breakdown header');
if (!block.includes('胴:')) fail(`unexpected body line in:\n${block}`);
if (block.includes('個体補正')) fail('legacy 個体補正 label must not appear');
console.log('OK: aggregate totals, stat roll, drawbacks, slot breakdown');

const emptyBlock = formatEquippedAffixProfileFromRows([]);
if (emptyBlock !== 'なし') fail(`empty equip should be なし, got ${emptyBlock}`);
console.log('OK: empty affix display');

const summary = buildEquipmentAffixSummary(rows);
const text = formatAffixSummaryText(summary);
if (text.length > 1024) fail(`display too long: ${text.length}`);
console.log('OK: display length within embed limit');

const townUi = fs.readFileSync(path.join(process.cwd(), 'src/utils/townUi.ts'), 'utf8');
const profileCmd = fs.readFileSync(path.join(process.cwd(), 'src/commands/profile.ts'), 'utf8');
const prepSystem = fs.readFileSync(path.join(process.cwd(), 'src/systems/prepSystem.ts'), 'utf8');
if (!/装備厳選効果/.test(townUi) || !/formatEquippedAffixProfileBlock/.test(townUi)) {
  fail('townUi missing affix profile field');
}
if (!/装備厳選効果/.test(profileCmd) || !/formatEquippedAffixProfileBlock/.test(profileCmd)) {
  fail('profile command missing affix profile field');
}
if (!/formatEquippedAffixProfileBlock/.test(prepSystem)) {
  fail('prepSystem missing affix profile block');
}
console.log('OK: profile UI wiring');

if (failed) {
  console.error(`\nFAIL: ${failed} issue(s)`);
  process.exit(1);
}
console.log('\nPASS: equipped affix profile check');
