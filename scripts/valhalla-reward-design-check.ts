/** valhalla-reward-design-check — npx tsx scripts/valhalla-reward-design-check.ts */
import { getDb } from '../src/db/database';
import { ensureMaterialsSeed } from '../src/db/seedData/materials';
import {
  AFFIX_REROLL_ASSIST_ID,
  SILENT_PAGE_ID,
  UR_LOTTERY_SHARD_ID,
  VALHALLA_ACCESSORY_DROP_IDS,
  VALHALLA_ARMOR_DROP_IDS,
  VALHALLA_EMBLEM_ID,
  VALHALLA_FIRST_CLEAR_REWARDS,
  VALHALLA_REPEAT_REWARDS,
  VALHALLA_BOSS_MONSTER_IDS,
  buildValhallaRewardAuditRows,
} from '../src/db/seedData/valhallaRewardMaster';
import { grantValhallaBossRewards } from '../src/systems/valhallaRewardSystem';

const fails: string[] = [];
const warns: string[] = [];

function assert(cond: boolean, msg: string) {
  if (!cond) fails.push(msg);
}

function main() {
  const db = getDb();
  ensureMaterialsSeed(db);

  const fc = VALHALLA_FIRST_CLEAR_REWARDS;
  const rp = VALHALLA_REPEAT_REWARDS;
  const rows = buildValhallaRewardAuditRows();

  console.log('## valhalla-reward-design-check\n');

  assert(fc.silentPage === 1, 'first clear silent page must be 1');
  assert(fc.emblem === 10, 'first clear emblem must be 10');
  assert(rp.emblemMin === 4 && rp.emblemMax === 8, 'repeat emblem must be 4-8');
  assert(rp.silentPageRate === 0.04, 'repeat silent page rate must be 4%');
  assert(rp.expMin >= 2500 && rp.expMax <= 4000, 'repeat exp out of range');
  assert(rp.jobExpMin >= 1200 && rp.jobExpMax <= 2000, 'repeat job exp out of range');
  assert(rp.goldMin >= 2500 && rp.goldMax <= 5000, 'repeat gold out of range');
  assert(fc.expMin >= 5000 && fc.expMax <= 8000, 'first clear exp out of range');
  assert(fc.jobExpMin >= 2500 && fc.jobExpMax <= 4000, 'first clear job exp out of range');
  assert(fc.goldMin >= 5000 && fc.goldMax <= 8000, 'first clear gold out of range');
  assert(rp.armorRateMin >= 0.15 && rp.armorRateMax <= 0.25, 'armor rate out of spec');
  assert(rp.accessoryRateMin >= 0.08 && rp.accessoryRateMax <= 0.15, 'accessory rate out of spec');
  assert(rp.urLotteryRateMin >= 0.01 && rp.urLotteryRateMax <= 0.03, 'UR lottery rate out of spec');
  assert(rp.affixRerollAssistRateMin >= 0.005 && rp.affixRerollAssistRateMax <= 0.015, 'affix assist rate out of spec');
  assert(rp.oldKingArmorRateMin >= 0.03 && rp.oldKingArmorRateMax <= 0.06, 'old king armor rate out of spec');
  assert(rp.oldKingAccessoryRateMin >= 0.01 && rp.oldKingAccessoryRateMax <= 0.03, 'old king accessory rate out of spec');

  const fcPage = rows.find((r) => r.first_clear_or_repeat === 'first_clear' && r.item_id === SILENT_PAGE_ID);
  assert(!!fcPage && fcPage.drop_rate === '100%', 'audit: first clear silent page 100%');
  const fcEmblem = rows.find((r) => r.first_clear_or_repeat === 'first_clear' && r.item_id === VALHALLA_EMBLEM_ID);
  assert(!!fcEmblem && fcEmblem.amount_min === 10, 'audit: first clear emblem x10');
  const rpPage = rows.find((r) => r.first_clear_or_repeat === 'repeat' && r.item_id === SILENT_PAGE_ID);
  assert(!!rpPage && rpPage.drop_rate === '4%', 'audit: repeat silent page 4%');
  assert(rows.some((r) => r.item_id === '(valhalla_armor)'), 'audit: valhalla armor in repeat');
  assert(rows.some((r) => r.item_id === '(valhalla_accessory)'), 'audit: valhalla accessory in repeat');
  assert(rows.some((r) => r.item_id === '(old_king_armor)'), 'audit: old king armor in repeat');
  assert(rows.some((r) => r.item_id === UR_LOTTERY_SHARD_ID), 'audit: UR lottery shard');
  assert(rows.some((r) => r.item_id === AFFIX_REROLL_ASSIST_ID), 'audit: affix reroll assist');
  assert(rows.some((r) => r.reward_context === 'valhalla_coop_boss'), 'audit: valhalla_coop_boss context rows');

  for (const id of [VALHALLA_EMBLEM_ID, SILENT_PAGE_ID, UR_LOTTERY_SHARD_ID, AFFIX_REROLL_ASSIST_ID]) {
    const item = db.prepare('SELECT id FROM items WHERE id = ?').get(id);
    assert(!!item, `missing item ${id}`);
  }

  for (const id of VALHALLA_BOSS_MONSTER_IDS) {
    const m = db.prepare('SELECT id FROM monsters WHERE id = ?').get(id);
    assert(!!m, `missing valhalla boss monster ${id}`);
  }

  for (const id of [...VALHALLA_ARMOR_DROP_IDS, ...VALHALLA_ACCESSORY_DROP_IDS]) {
    const eq = db.prepare('SELECT item_id FROM equipment WHERE item_id = ?').get(id);
    if (!eq) warns.push(`equipment drop id not in DB: ${id}`);
  }

  assert(typeof grantValhallaBossRewards === 'function', 'grantValhallaBossRewards not exported');

  if (fails.length) {
    console.error('FAIL');
    for (const f of fails) console.error(`- ${f}`);
    if (warns.length) {
      console.error('\nWARN');
      for (const w of warns) console.error(`- ${w}`);
    }
    process.exit(1);
  }

  console.log('OK');
  console.log(`- bosses: ${VALHALLA_BOSS_MONSTER_IDS.length}`);
  console.log(`- audit rows: ${rows.length}`);
  if (warns.length) {
    console.log('\nWARN');
    for (const w of warns) console.log(`- ${w}`);
  }
}

main();
