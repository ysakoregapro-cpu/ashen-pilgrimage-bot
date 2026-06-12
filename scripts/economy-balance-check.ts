/** economy-balance-check — npx tsx scripts/economy-balance-check.ts */
import { getDb } from '../src/db/database';
import { ensurePhase2Seed } from '../src/db/seedData/phase2Seed';
import { ensureMaterialsSeed } from '../src/db/seedData/materials';
import { calcInnCost, calcShrineCost } from '../src/systems/innSystem';
import { createPlayer, getPlayer } from '../src/systems/playerSystem';
import { RESCUE_HP_MULT, RAID_HP_MULT } from '../src/systems/coop/coopTypes';
import { encounterRewardMult, totalAttackPowerMult } from '../src/systems/multiEncounter';

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

  const lampTotal = sell * 10;
  if (lampTotal >= 2000) issues.push(`灯火10個売却 ${lampTotal}G ≥ 2000G`);

  // レイド/救難報酬の売却金策チェック
  const raidItems = ['wpn_valhalla_blade', 'acc_raid_random', 'raid_deep_core'];
  for (const id of raidItems) {
    const row = db.prepare('SELECT sell_price, shop_sell_price, rarity FROM items WHERE id = ?').get(id) as {
      sell_price: number; shop_sell_price: number | null; rarity: string;
    } | undefined;
    if (!row) continue;
    const sp = row.shop_sell_price ?? row.sell_price ?? 0;
    if (id === 'wpn_valhalla_blade' && sp > 800) issues.push(`URレイド武器売却 ${sp}G 高すぎ`);
    if (id === 'raid_deep_core' && sp > 120) issues.push(`レイド素材売却 ${sp}G 高すぎ`);
  }

  // 救難は通常戦闘より控えめ（bandit基準）
  const bandit = db.prepare('SELECT exp_reward, gold_reward FROM monsters WHERE id = ?').get('mon_bandit') as {
    exp_reward: number; gold_reward: number;
  };
  if (bandit) {
    const rescueLeaderGold = Math.floor(bandit.gold_reward * 0.3);
    const rescueHelperGold = Math.floor(bandit.gold_reward * 0.2);
    const normalGold = Math.floor(bandit.gold_reward * 1.2);
    if (rescueLeaderGold >= normalGold * 0.5) issues.push('救難主催ゴールド高すぎ');
    if (rescueHelperGold >= normalGold * 0.35) issues.push('救難助っ人ゴールド高すぎ');
    console.log(`   救難報酬目安: 主催${rescueLeaderGold}G / 助っ人${rescueHelperGold}G (通常${normalGold}G)`);
  }

  const boss = db.prepare('SELECT exp_reward, gold_reward, hp FROM monsters WHERE id = ?').get('mon_deep_core_boss') as {
    exp_reward: number; gold_reward: number; hp: number;
  };
  if (boss) {
    const raidGold = Math.floor(boss.gold_reward * 2 * 1.2);
    if (raidGold > 5000) issues.push(`レイド基本G ${raidGold} 高すぎ`);
    console.log(`   レイドHP倍率: x${RAID_HP_MULT[4]} / 救難HP倍率: x${RESCUE_HP_MULT[4]}`);
  }

  const r2 = encounterRewardMult(2, false);
  const r3 = encounterRewardMult(3, false);
  const f2 = totalAttackPowerMult(2, 5);
  const f3 = totalAttackPowerMult(3, 7);
  console.log(`   複数戦報酬: 2体×${r2} / 3体×${r3}`);
  console.log(`   複数戦火力: 2体×${f2.toFixed(2)} / 3体×${f3.toFixed(2)}`);
  if (r3 > 2.2) issues.push(`3体報酬倍率 ${r3} > 2.2`);
  if (f2 > 1.7) issues.push(`2体火力 ${f2.toFixed(2)} > 1.7`);
  if (f3 > 2.0) issues.push(`3体火力 ${f3.toFixed(2)} > 2.0`);

  if (issues.length) {
    console.error('❌ economy-balance-check failed:');
    for (const i of issues) console.error('  -', i);
    process.exit(1);
  }
  console.log('✅ economy-balance-check passed');
  console.log(`   灯火売却: ${sell}G, 宿屋: ${innCost}G, 救護所: ${shrineCost}G`);
}

main();
