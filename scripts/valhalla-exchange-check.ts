/** valhalla-exchange-check — npx tsx scripts/valhalla-exchange-check.ts */
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { getDb } from '../src/db/database';
import { ensureMaterialsSeed } from '../src/db/seedData/materials';
import { VALHALLA_EMBLEM_ID } from '../src/db/seedData/valhallaRewardMaster';
import { SILENT_PAGE_USAGE, VALHALLA_EXCHANGE_TABLE } from '../src/db/seedData/valhallaExchangeMaster';

const GUIDE_DIR = path.join(process.cwd(), 'reports', 'guide');
const fails: string[] = [];
const warns: string[] = [];

function assert(cond: boolean, msg: string) {
  if (!cond) fails.push(msg);
}

function main() {
  execSync('npx tsx scripts/export-guide-data.ts', { stdio: 'pipe', cwd: process.cwd() });

  const db = getDb();
  ensureMaterialsSeed(db);

  console.log('## valhalla-exchange-check\n');

  const emblem = db.prepare('SELECT id, category FROM items WHERE id = ?').get(VALHALLA_EMBLEM_ID) as
    { id: string; category: string } | undefined;
  assert(!!emblem, 'valhalla_emblem not defined');
  assert(emblem?.category === 'currency_material', 'valhalla_emblem category must be currency_material');
  assert(VALHALLA_EXCHANGE_TABLE.length >= 9, 'exchange table too short');

  const minCost = Math.min(...VALHALLA_EXCHANGE_TABLE.filter((e) => e.currently_available).map((e) => e.cost_valhalla_emblem));
  assert(minCost >= 8, 'exchange costs too cheap');
  assert(
    VALHALLA_EXCHANGE_TABLE.some((e) => e.exchange_id === 'vex_mana_valhalla' && e.cost_valhalla_emblem === 8),
    'mana valhalla exchange 8 emblem',
  );

  const silentPageExchanges = VALHALLA_EXCHANGE_TABLE.filter((e) => e.cost_silent_page > 0);
  assert(silentPageExchanges.length >= 2, 'need silent page premium exchanges');
  assert(
    VALHALLA_EXCHANGE_TABLE.some((e) => e.exchange_id === 'vex_ur_lottery' && e.cost_valhalla_emblem === 150 && e.cost_silent_page === 3),
    'UR lottery exchange 150+3 pages',
  );
  assert(
    VALHALLA_EXCHANGE_TABLE.some((e) => e.exchange_id === 'vex_affix_protect' && e.cost_valhalla_emblem === 300 && e.cost_silent_page === 1),
    'affix protect exchange 300+1 page',
  );

  const unimplemented = VALHALLA_EXCHANGE_TABLE.filter((e) => e.ui_implemented);
  const uiCount = unimplemented.length;
  if (uiCount !== 7) {
    warns.push(`expected 7 ui_implemented exchanges, got ${uiCount}`);
  }
  const futureInUi = VALHALLA_EXCHANGE_TABLE.filter((e) => e.ui_implemented && !e.currently_available);
  if (futureInUi.length > 0) warns.push('some ui_implemented entries not currently_available');

  assert(fs.existsSync(path.join(GUIDE_DIR, 'valhalla_exchange.csv')), 'valhalla_exchange.csv missing');
  const csv = fs.readFileSync(path.join(GUIDE_DIR, 'valhalla_exchange.csv'), 'utf8');
  assert(csv.includes('vex_ur_lottery'), 'CSV missing vex_ur_lottery');
  assert(csv.includes('vex_affix_protect'), 'CSV missing vex_affix_protect');
  assert(csv.includes(VALHALLA_EMBLEM_ID) || csv.includes('150'), 'CSV missing emblem costs');

  assert(SILENT_PAGE_USAGE.length >= 5, 'silent page usage catalog too short');
  const futureOnly = SILENT_PAGE_USAGE.filter((u) => u.implemented);
  if (futureOnly.length > 0) warns.push('some SILENT_PAGE_USAGE marked implemented (should be future)');

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
  console.log(`- exchange entries: ${VALHALLA_EXCHANGE_TABLE.length}`);
  console.log(`- silent page usages: ${SILENT_PAGE_USAGE.length}`);
  if (warns.length) {
    console.log('\nWARN');
    for (const w of warns) console.log(`- ${w}`);
  }
}

main();
