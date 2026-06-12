/** high-rarity-supply-check — npx tsx scripts/high-rarity-supply-check.ts */
import { buildDropEconomyRows, getMoonBodySupplyCheck, initDropEconomyAuditDb, NORMAL_EXPLORE_POOL_EXCLUDED } from './audit/dropEconomyIndex';
import { buildEffectiveRewardPool } from '../src/systems/townLootSystem';
import { AREAS } from '../src/db/seedData/areas';

const fails: string[] = [];
const warns: string[] = [];

function main() {
  initDropEconomyAuditDb();
  const rows = buildDropEconomyRows();

  for (const r of rows.filter((x) => ['SSR', 'UR'].includes(x.rarity) && x.is_equipment === 'YES')) {
    if (r.estimated_rate_band.includes('HIGH')) fails.push(`SSR/UR gear high rate: ${r.item_id} ${r.estimated_rate_band}`);
    if (r.progression_tier === 'early' && r.area_sources !== '—') fails.push(`SSR/UR gear in early tier: ${r.item_id}`);
  }

  for (const r of rows.filter((x) => ['SSR', 'UR'].includes(x.rarity) && x.category === 'material')) {
    if (r.expected_surplus_risk === 'high' && r.is_key_material === 'YES') {
      warns.push(`key material high surplus risk: ${r.item_id}`);
    }
    if (r.gold_farming_risk === 'high' && r.estimated_rate_band.includes('HIGH')) {
      fails.push(`gold farm risk: ${r.item_id} sell=${r.sell_price} rate=${r.estimated_rate_band}`);
    }
  }

  const moon = getMoonBodySupplyCheck();
  if (moon.rateBand.includes('HIGH')) fails.push(`moon body oversupply: ${moon.rateBand}`);
  console.log(`moon body check: ${moon.name} weight=${moon.totalWeight} rate=${moon.rateBand} areas=${moon.areas.join(',')}`);

  for (const ex of NORMAL_EXPLORE_POOL_EXCLUDED) {
    for (const area of AREAS) {
      if (buildEffectiveRewardPool(area.town, area.id).some((p) => p.item_id === ex)) {
        fails.push(`legacy/excluded in pool: ${ex} @ ${area.id}`);
      }
    }
  }

  for (const r of rows.filter((x) => ['SSR', 'UR'].includes(x.rarity) && x.current_purpose.includes('unknown') && x.area_sources !== '—')) {
    fails.push(`unknown high-rarity in pool: ${r.item_id}`);
  }

  const ssrUrSets = ['set_moon', 'set_deep_furnace', 'set_black_lamp', 'set_starfall', 'set_valhalla', 'set_old_king'];
  for (const setId of ssrUrSets) {
    const pieces = rows.filter((r) => r.set_id === setId && r.is_equipment === 'YES');
    const obtainable = pieces.filter((p) => p.area_sources !== '—' || p.shop_sources !== '—');
    if (obtainable.length < Math.min(3, pieces.length)) {
      warns.push(`set ${setId}: only ${obtainable.length}/${pieces.length} pieces in pools`);
    }
  }

  console.log('\n## high-rarity-supply-check');
  if (warns.length) {
    console.log('\n## WARN');
    for (const w of warns) console.log(`- ${w}`);
  }
  if (fails.length) {
    console.error('\n## FAIL');
    for (const f of fails) console.error(`- ${f}`);
    process.exit(1);
  }
  console.log('\n✅ high-rarity-supply-check passed');
}

main();
