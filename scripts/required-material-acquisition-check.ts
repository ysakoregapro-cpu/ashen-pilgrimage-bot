/** required-material-acquisition-check — npx tsx scripts/required-material-acquisition-check.ts */
import { initAuditDb, emptyResult, writeMdCsvPair, exitCheckResult } from './balance/balanceHelpers';
import { buildItemPurposeCatalog } from '../src/db/seedData/itemPurposeMaster';
import { getEnhanceRequirement } from '../src/systems/enhanceSystem';

const AUDIT_IDS = [
  'upg_rough_stone', 'upg_stone', 'upg_fine_stone', 'upg_rare_stone',
  'src_upg_core', 'src_upg_shard', 'src_valhalla_core', 'mat_star_pilgrim_echo',
  'rep_patch', 'rep_deep_repair', 'boss_silent_page', 'mat_ur_lottery_shard', 'mat_affix_reroll_assist',
  'valhalla_emblem',
];

const result = emptyResult();

function main() {
  const init = initAuditDb();
  const rows: string[][] = [];

  const enhanceMats = new Set<string>();
  for (const r of ['N', 'R', 'SR', 'SSR', 'UR']) {
    for (let lv = 0; lv < 15; lv++) enhanceMats.add(getEnhanceRequirement(lv, r).stoneId);
  }

  if (init.ok) {
    const catalog = buildItemPurposeCatalog(init.db);
    const byId = new Map(catalog.map((c) => [c.id, c]));
    for (const id of [...AUDIT_IDS, ...enhanceMats]) {
      const p = byId.get(id);
      if (!p) {
        result.fails.push(`${id}: itemPurpose 未登録`);
        rows.push([id, 'unknown', 'none', 'FAIL', 'catalog missing']);
        continue;
      }
      const routes: string[] = [];
      if (p.shouldDropInNormalPool) routes.push('normal_drop');
      if (p.shouldDropInBossPool) routes.push('boss_drop');
      if (p.shouldDropInRaidPool) routes.push('raid_drop');
      if (p.sinkDescription.includes('徽章') || p.sinkDescription.includes('交換')) routes.push('valhalla_exchange');
      const routeStr = routes.length ? routes.join('+') : p.progressionTier === 'none' ? 'vendor/craft' : 'check_notes';
      let status = 'OK';
      if (routes.length === 0 && p.purpose !== 'vendor_item' && p.purpose !== 'consumable') {
        if (id.startsWith('upg_') || id.startsWith('src_') || id.startsWith('rep_')) {
          result.warns.push(`${id}: 入手経路要確認 (${p.sinkDescription})`);
          status = 'WARN';
        }
      }
      if (id === 'boss_silent_page' && p.shouldDropInNormalPool) {
        result.fails.push('無答の頁が通常探索プールに含まれる');
        status = 'FAIL';
      }
      rows.push([id, p.purpose, routeStr, status, p.sinkDescription.slice(0, 80)]);
    }

    const srcUpgs = init.db.prepare(`
      SELECT material_requirements_json FROM src_weapon_upgrades WHERE target_src_level >= 11
    `).all() as Array<{ material_requirements_json: string }>;
    const srcMatIds = new Set<string>();
    for (const u of srcUpgs) {
      const mats = JSON.parse(u.material_requirements_json) as Array<{ id: string; qty: number }>;
      for (const m of mats) srcMatIds.add(m.id);
    }
    for (const mid of srcMatIds) {
      if (!byId.get(mid)) result.warns.push(`Src強化素材 ${mid}: purpose未整備`);
    }
  } else {
    result.warns.push(`DB不可: ${init.error}`);
    rows.push(['(db)', 'SKIP', 'none', 'WARN', init.error]);
  }

  writeMdCsvPair(
    'required-material-acquisition-check',
    ['item_id', 'purpose', 'routes', 'status', 'notes'],
    rows,
    ['## 要求素材入手経路', '', '強化・覚醒・修理・Src・徽章交換素材の route 監査。'],
  );
  exitCheckResult('required-material-acquisition-check', result);
}

main();
