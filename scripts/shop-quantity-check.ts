/** shop-quantity-check — npx tsx scripts/shop-quantity-check.ts */
import { calcMaxBuyable } from '../src/systems/shopSystem';

function main() {
  const issues: string[] = [];

  if (calcMaxBuyable(340, 30) !== 11) issues.push('340G/30G max != 11');
  if (calcMaxBuyable(150, 30) !== 5) issues.push('150G/30G max != 5');
  if (calcMaxBuyable(29, 30) !== 0) issues.push('不足時 max != 0');

  const opts = (gold: number, price: number) => {
    const max = calcMaxBuyable(gold, price);
    return [1, 3, 5, 10, max].filter((n) => n >= 1 && n <= max);
  };
  const o340 = opts(340, 30);
  if (!o340.includes(1) || !o340.includes(3) || !o340.includes(10) || o340[o340.length - 1] !== 11) {
    issues.push('340G 購入数オプション不正');
  }
  if (opts(20, 30).length !== 0) issues.push('0個購入オプションが存在');

  const customIds = [
    'shop:buy_qty:cons_heal_potion',
    'shop:confirm_buy:cons_heal_potion:5',
    'shop:buy_pick:cons_heal_potion',
    'shop:sell_qty:123',
    'shop:confirm_sell:123:5',
  ];
  const dup = customIds.filter((id, i) => customIds.indexOf(id) !== i);
  if (dup.length) issues.push('custom_id 重複');

  console.log('shop-quantity-check');
  if (issues.length) {
    console.error('FAIL');
    for (const i of issues) console.error(' -', i);
    process.exit(1);
  }
  console.log('OK — 1/3/5/10/買えるだけ, 不足時0, custom_id');
}

main();
