/** upgrade-material-progression-check — npx tsx scripts/upgrade-material-progression-check.ts */
import { getEnhanceRequirement } from '../src/systems/enhanceSystem';
import { initAuditDb, emptyResult, writeMdCsvPair, exitCheckResult } from './balance/balanceHelpers';

const RARITIES = ['N', 'R', 'SR', 'SSR', 'UR'] as const;
const SRC_GOLD_RANGES: Record<number, [number, number]> = {
  11: [12000, 18000],
  12: [16000, 22000],
  13: [20000, 26000],
  14: [24000, 30000],
  15: [30000, 38000],
};
const result = emptyResult();

function main() {
  const rows: string[][] = [];

  for (const rarity of RARITIES) {
    const max = ({ N: 5, R: 5, SR: 7, SSR: 10, UR: 15 } as Record<string, number>)[rarity] ?? 5;
    for (let lv = 0; lv < max; lv++) {
      const req = getEnhanceRequirement(lv, rarity);
      let band = '+1-3';
      if (lv + 1 >= 11) band = '+11-15';
      else if (lv + 1 >= 7) band = '+7-10';
      else if (lv + 1 >= 4) band = '+4-6';
      if (rarity === 'N' || rarity === 'R') {
        if (req.goldCost > 1500 && lv + 1 <= 6) result.warns.push(`${rarity}+${lv + 1}: gold ${req.goldCost} > 1500`);
      }
      rows.push([rarity, String(lv + 1), band, req.stoneId, String(req.stoneQty), String(req.goldCost), 'normal_enhance']);
    }
  }

  const init = initAuditDb();
  if (init.ok) {
    const srcUpgs = init.db.prepare(`
      SELECT sw.name, su.target_src_level, su.gold_cost, su.material_requirements_json
      FROM src_weapon_upgrades su
      JOIN src_weapons sw ON su.src_weapon_id = sw.id
      WHERE su.target_src_level >= 11
      ORDER BY su.target_src_level
      LIMIT 50
    `).all() as Array<{ name: string; target_src_level: number; gold_cost: number; material_requirements_json: string }>;
    const seenSrcLevels = new Set<number>();
    for (const u of srcUpgs) {
      const mats = JSON.parse(u.material_requirements_json) as Array<{ id: string; qty: number }>;
      const matStr = mats.map((m) => `${m.id}x${m.qty}`).join('+');
      if (mats.some((m) => m.id === 'boss_silent_page')) {
        result.fails.push(`Src+${u.target_src_level}: 無答の頁が必須化されている`);
      }
      const range = SRC_GOLD_RANGES[u.target_src_level];
      if (range && !seenSrcLevels.has(u.target_src_level)) {
        seenSrcLevels.add(u.target_src_level);
        if (u.gold_cost < range[0] || u.gold_cost > range[1]) {
          result.warns.push(`Src+${u.target_src_level}: gold ${u.gold_cost} が目安${range[0]}-${range[1]}外`);
        }
      }
      rows.push(['Src', String(u.target_src_level), '+11-15', matStr, '', String(u.gold_cost), u.name]);
    }
  } else {
    result.warns.push(`Src強化DB監査スキップ: ${init.error}`);
  }

  writeMdCsvPair(
    'upgrade-material-progression',
    ['rarity', 'target_level', 'band', 'material', 'qty', 'gold', 'context'],
    rows,
    ['## 強化素材段階', '', '通常強化は getEnhanceRequirement、Src+11〜は DB seed。'],
  );
  exitCheckResult('upgrade-material-progression-check', result);
}

main();
