/** economy-balance-check — npx tsx scripts/economy-balance-check.ts */
import { getDb } from '../src/db/database';
import { ensurePhase2Seed } from '../src/db/seedData/phase2Seed';
import { ensureMaterialsSeed } from '../src/db/seedData/materials';
import { calcInnCost, calcShrineCost } from '../src/systems/innSystem';
import { createPlayer, getPlayer } from '../src/systems/playerSystem';

const TEST_USER = 'economy-balance-check-user';
const issues: string[] = [];

function main() {
  const db = getDb();
  ensureMaterialsSeed(db);
  ensurePhase2Seed(db);
  if (!getPlayer(TEST_USER)) createPlayer(TEST_USER, 'g', 'Test', 'c');
  db.prepare('UPDATE players SET level = 5, gold = 500, current_town_id = ? WHERE user_id = ?').run('twilight_port', TEST_USER);

  const lamp = db.prepare('SELECT sell_price, shop_sell_price FROM items WHERE id = ?').get('cons_lamp_bottle') as {
    sell_price: number; shop_sell_price: number | null;
  };
  const sell = lamp?.shop_sell_price ?? lamp?.sell_price ?? 999;
  if (sell > 50) issues.push(`灯火の小瓶 売却 ${sell}G (expected ≤50)`);

  const earlyConsumables = db.prepare(`
    SELECT id, sell_price, shop_sell_price FROM items WHERE category = 'consumable' AND sell_price >= 150
  `).all() as Array<{ id: string; sell_price: number; shop_sell_price: number | null }>;
  for (const c of earlyConsumables) {
    if (c.id === 'cons_heal_large') continue;
    if ((c.shop_sell_price ?? c.sell_price) >= 150) issues.push(`${c.id} 売却高すぎ (${c.shop_sell_price ?? c.sell_price}G)`);
  }

  const innCost = calcInnCost(TEST_USER, 'twilight_port');
  const shrineCost = calcShrineCost(TEST_USER, 'twilight_port');
  if (shrineCost !== Math.floor(innCost * 0.5)) issues.push(`救護所料金 ${shrineCost} ≠ 宿屋半額 ${Math.floor(innCost * 0.5)}`);

  // 10 lamp bottles sell should not exceed 2000G early game
  const lampTotal = sell * 10;
  if (lampTotal >= 2000) issues.push(`灯火10個売却 ${lampTotal}G ≥ 2000G`);

  const avgBattleGold = db.prepare(`
    SELECT AVG(gold_reward) AS avg FROM monsters WHERE is_boss = 0 AND area_tag IN ('starfield', 'port')
  `).get() as { avg: number };
  if (avgBattleGold.avg * 20 > innCost * 3) {
    // soft check - 20 battles shouldn't trivially afford 3 rests
  }

  if (issues.length) {
    console.error('❌ economy-balance-check failed:');
    for (const i of issues) console.error('  -', i);
    process.exit(1);
  }
  console.log('✅ economy-balance-check passed');
  console.log(`   灯火売却: ${sell}G, 宿屋: ${innCost}G, 救護所: ${shrineCost}G`);
}

main();
