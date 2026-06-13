/** valhalla-emblem-exchange-ui-check — npx tsx scripts/valhalla-emblem-exchange-ui-check.ts */
import { getDb } from '../src/db/database';
import { ensurePhase2Seed } from '../src/db/seedData/phase2Seed';
import { ensureMaterialsSeed } from '../src/db/seedData/materials';
import { createPlayer, getPlayer } from '../src/systems/playerSystem';
import {
  VALHALLA_EXCHANGE_TABLE,
  getUiAvailableExchanges,
} from '../src/db/seedData/valhallaExchangeMaster';
import {
  checkExchangeAffordability,
  executeValhallaExchange,
  formatExchangeListText,
  getEmblemBalance,
} from '../src/systems/valhallaExchangeSystem';
import {
  buildValhallaExchangeButtons,
  buildValhallaExchangeConfirmButtons,
  buildValhallaExchangeEmbed,
} from '../src/systems/valhallaExchangeUi';
import { addItem } from '../src/systems/inventorySystem';
import { VALHALLA_EMBLEM_ID } from '../src/db/seedData/valhallaRewardMaster';

const USER = 'vex-ui-test-user';
const FAC = 'f_valhalla_raid';

const fails: string[] = [];

function assert(cond: boolean, msg: string) {
  if (!cond) fails.push(msg);
}

function main() {
  const db = getDb();
  ensurePhase2Seed(db);
  ensureMaterialsSeed(db);
  if (!getPlayer(USER)) createPlayer(USER, 'vex-guild', USER, 'ch');

  console.log('## valhalla-emblem-exchange-ui-check\n');

  const uiEntries = getUiAvailableExchanges();
  assert(uiEntries.length === 6, `UI entries should be 6, got ${uiEntries.length}`);
  assert(!uiEntries.some((e) => e.exchange_id === 'vex_ur_lottery'), 'UR lottery must not appear in UI');
  assert(!uiEntries.some((e) => e.exchange_id === 'vex_affix_reroll'), 'affix reroll must not appear in UI');
  assert(!uiEntries.some((e) => e.exchange_id === 'vex_affix_protect'), 'affix protect must not appear in UI');

  const embed = buildValhallaExchangeEmbed(USER);
  assert(embed.data.title?.includes('徽章'), 'exchange embed title');
  const listText = formatExchangeListText(USER);
  assert(listText.includes('徽章'), 'balance in list text');

  addItem(USER, VALHALLA_EMBLEM_ID, 200);
  const affordCheap = checkExchangeAffordability(USER, 'vex_repair_premium');
  assert(affordCheap.ok, 'affordable with 200 emblem');

  getDb().prepare('DELETE FROM player_inventory WHERE user_id = ? AND item_id = ?').run(USER, VALHALLA_EMBLEM_ID);
  const affordPoor = checkExchangeAffordability(USER, 'vex_repair_premium');
  assert(!affordPoor.ok, 'insufficient emblem disabled');

  addItem(USER, VALHALLA_EMBLEM_ID, 15);
  const buttons = buildValhallaExchangeButtons(USER, FAC);
  const disabledCount = buttons.flatMap((r) => r.components).filter((c) => c.data.disabled).length;
  assert(disabledCount >= 4, 'most exchanges disabled with 15 emblem');

  addItem(USER, VALHALLA_EMBLEM_ID, 200);
  const confirmBtns = buildValhallaExchangeConfirmButtons('vex_repair_premium', FAC, USER);
  assert(confirmBtns.length >= 1, 'confirm buttons exist');
  assert(confirmBtns[0]!.components.some((c) => c.data.custom_id?.startsWith('vex:confirm:')), 'confirm custom_id');

  const beforeQty = getEmblemBalance(USER);
  const result = executeValhallaExchange(USER, 'vex_repair_premium');
  assert(result.ok, `execute: ${result.message}`);
  assert(getEmblemBalance(USER) === beforeQty - 10, 'emblem deducted');
  const mat = db.prepare(`
    SELECT quantity FROM player_inventory WHERE user_id = ? AND item_id = 'rep_deep_repair'
  `).get(USER) as { quantity: number } | undefined;
  assert((mat?.quantity ?? 0) >= 1, 'repair material granted');

  const unimpl = VALHALLA_EXCHANGE_TABLE.filter((e) => !e.ui_implemented);
  assert(unimpl.length === 3, '3 future exchanges remain data-only');

  const navIds = buttons.flatMap((r) => r.components.map((c) => c.data.custom_id));
  assert(navIds.some((id) => id === `facility:view:${FAC}`), 'back button');
  assert(navIds.some((id) => id === 'town:home'), 'town home button');

  if (fails.length) {
    console.error('FAIL');
    for (const f of fails) console.error(`- ${f}`);
    process.exit(1);
  }
  console.log('OK');
  console.log(`- UI entries: ${uiEntries.length}`);
  console.log('- afford / confirm / execute / nav');
}

main();
