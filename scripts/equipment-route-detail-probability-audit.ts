/** equipment-route-detail-probability-audit.ts */
import { ensureDropBalanceSeed } from '../src/db/seedData/dropBalanceSeed';
import { ensureMasterDataSeed } from '../src/db/seedData/masterDataSeed';
import { ensurePhase2EquipmentRoutes } from '../src/db/seedData/ensurePhase2EquipmentRoutes';
import {
  getEquipmentRouteDetails,
  formatEquipmentRouteLines,
  getEquipmentRouteSectionFlags,
} from '../src/systems/equipmentRouteDetailSystem';
import {
  getArmorRouteBook,
  getWeaponRouteBook,
} from '../src/systems/equipmentRouteBook';
import { emptyResult, exitCheckResult, initAuditDb, writeMdCsvPair } from './balance/balanceHelpers';

const HEADERS = [
  'equipment_id', 'equipment_name', 'kind', 'rarity', 'route_kind', 'source_name',
  'area_name', 'enemy_name', 'boss_name', 'explicit_rate', 'weight', 'pool_total_weight',
  'estimated_rate_text', 'candidate_count', 'effective_rate_text', 'repeatable',
  'shown_in_command', 'has_enemy_drop_section', 'has_boss_rematch_section',
  'has_exchange_section', 'has_none_sections', 'legacy_or_unavailable', 'balance_note',
];

function slotKind(slot: string): string {
  return slot === 'weapon' ? 'weapon' : 'armor';
}

function flattenRows(): string[][] {
  const weapons = getWeaponRouteBook();
  const armors = getArmorRouteBook();
  const all = [...weapons, ...armors];
  const rows: string[][] = [];

  for (const item of all) {
    const routes = getEquipmentRouteDetails(item.item_id);
    const flags = getEquipmentRouteSectionFlags(item.item_id);
    const shown = formatEquipmentRouteLines(item.item_id).join('\n');

    if (!routes.length) {
      rows.push([
        item.item_id, item.name, slotKind(item.slot), item.rarity, 'none', '—',
        '—', '—', '—', '—', '—', '—', '—', '—', '—', '—',
        shown.length ? 'YES' : 'NO',
        flags.hasEnemyDrop ? 'YES' : 'NO',
        flags.hasBossRematch ? 'YES' : 'NO',
        flags.hasExchange ? 'YES' : 'NO',
        flags.hasNoneSections ? 'YES' : 'NO',
        flags.legacyOrUnavailable ? 'YES' : 'NO',
        'no routes',
      ]);
      continue;
    }

    for (const r of routes) {
      rows.push([
        item.item_id,
        item.name,
        slotKind(item.slot),
        item.rarity,
        r.kind,
        r.sourceName,
        r.areaName ?? '—',
        r.enemyName ?? '—',
        r.bossName ?? '—',
        r.explicitRate ?? '—',
        r.weight != null ? String(r.weight) : '—',
        r.poolTotalWeight != null ? String(r.poolTotalWeight) : '—',
        r.estimatedRateText ?? '—',
        r.candidateCount != null ? String(r.candidateCount) : '—',
        r.effectiveRateText ?? '—',
        r.repeatable ? 'YES' : 'NO',
        shown.includes('【') ? 'YES' : 'NO',
        flags.hasEnemyDrop ? 'YES' : 'NO',
        flags.hasBossRematch ? 'YES' : 'NO',
        flags.hasExchange ? 'YES' : 'NO',
        flags.hasNoneSections ? 'YES' : 'NO',
        flags.legacyOrUnavailable ? 'YES' : 'NO',
        'ok',
      ]);
    }
  }
  return rows;
}

function validateExamples(result: ReturnType<typeof emptyResult>): void {
  const valhallaHead = getEquipmentRouteDetails('arm_set_valhalla_head');
  if (!valhallaHead.some((r) => r.kind === 'explore' && r.areaName?.includes('ヴァルハラ外郭'))) {
    result.fails.push('arm_set_valhalla_head: missing explore valhalla outer');
  }
  if (!valhallaHead.some((r) => r.kind === 'valhalla_boss')) {
    result.fails.push('arm_set_valhalla_head: missing valhalla boss rematch');
  }
  if (!valhallaHead.some((r) => r.kind === 'exchange_random' || r.kind === 'exchange_select')) {
    result.fails.push('arm_set_valhalla_head: missing exchange routes');
  }

  const skyBow = getEquipmentRouteDetails('wpn_sky_bow_fress');
  const skyLines = formatEquipmentRouteLines('wpn_sky_bow_fress');
  if (!skyBow.some((r) => r.kind === 'explore' && r.areaName?.includes('空塞'))) {
    result.fails.push('wpn_sky_bow_fress: missing explore sky lift');
  }
  if (!skyLines.includes('【敵討伐】') || !skyLines.includes('・なし')) {
    result.fails.push('wpn_sky_bow_fress: missing enemy none section');
  }
}

function main() {
  const result = emptyResult();
  const init = initAuditDb();
  if (!init.ok) {
    result.warns.push(init.error);
    writeMdCsvPair('equipment-route-detail-probability-audit', HEADERS, [], ['DB unavailable']);
    exitCheckResult('equipment-route-detail-probability-audit', result);
    return;
  }
  ensurePhase2EquipmentRoutes(init.db);
  ensureDropBalanceSeed(init.db);
  ensureMasterDataSeed(init.db);

  const rows = flattenRows();
  validateExamples(result);

  const playable = rows.filter((r) => r[22] !== 'YES');
  const exploreOnly = new Set<string>();
  for (const item of [...getWeaponRouteBook(), ...getArmorRouteBook()]) {
    if (item.legacy) continue;
    const flags = getEquipmentRouteSectionFlags(item.item_id);
    const lines = formatEquipmentRouteLines(item.item_id);
    const hasExplore = lines.includes('【探索】');
    const hasOther = flags.hasEnemyDrop || flags.hasBossRematch || flags.hasExchange || flags.hasShop;
    if (hasExplore && !hasOther && !flags.legacyOrUnavailable) {
      exploreOnly.add(item.item_id);
    }
  }
  if (exploreOnly.size > 30) {
    result.warns.push(`explore-only display: ${exploreOnly.size} items (may be OK for low-tier gear)`);
  }

  writeMdCsvPair(
    'equipment-route-detail-probability-audit',
    HEADERS,
    rows,
    [`- rows: ${rows.length}`, `- explore-only flagged: ${exploreOnly.size}`],
  );
  exitCheckResult('equipment-route-detail-probability-audit', result);
}

main();
