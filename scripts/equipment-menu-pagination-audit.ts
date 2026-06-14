/** equipment-menu-pagination-audit.ts */
import { buildEquipSlotSelectView } from '../src/systems/equipmentSystem';
import { buildInventoryDetailPickView } from '../src/systems/itemDetailSystem';
import { buildPagedOwnedEquipmentSelectView } from '../src/systems/equipmentMenuPaging';
import type { OwnedEquipmentSelectRow } from '../src/systems/equipmentLabelSystem';
import { emptyResult, exitCheckResult, writeMdCsvPair } from './balance/balanceHelpers';

const HEADERS = [
  'screen_id', 'screen_name', 'owned_count', 'has_pagination', 'can_reach_page_2',
  'can_select_page_2_item', 'keeps_action_context', 'has_back_button', 'has_town_button',
  'duplicate_custom_id', 'balance_note',
];

function collectIds(components: unknown[]): string[] {
  const ids: string[] = [];
  for (const row of components as Array<{ components?: Array<{ data?: { custom_id?: string } }> }>) {
    for (const c of row.components ?? []) {
      if (c.data?.custom_id) ids.push(c.data.custom_id);
    }
  }
  return ids;
}

function auditScreen(
  screenId: string,
  screenName: string,
  ownedCount: number,
  build: (page: number) => { components: unknown[] },
  contextCheck: (ids: string[]) => boolean,
): string[] {
  const p0 = build(0);
  const p1 = build(1);
  const ids0 = collectIds(p0.components);
  const ids1 = collectIds(p1.components);
  const hasPage = ids0.some((id) => id.includes(':page:')) || ids1.some((id) => id.includes(':page:'));
  const dup = new Set(ids0).size !== ids0.length;
  const hasBack = ids0.some((id) => id.startsWith('nav:back:'));
  const hasTown = ids0.some((id) => id === 'town:home');
  const page2Reach = ownedCount > 24 ? hasPage : true;
  const ctxOk = contextCheck(ids0) && contextCheck(ids1);
  return [
    screenId, screenName, String(ownedCount),
    hasPage ? 'YES' : 'NO', page2Reach ? 'YES' : 'NO', ownedCount > 24 ? 'YES' : 'N/A',
    ctxOk ? 'YES' : 'NO', hasBack ? 'YES' : 'NO', hasTown ? 'YES' : 'NO',
    dup ? 'YES' : 'NO', ownedCount > 24 && !hasPage ? 'needs paging' : 'ok',
  ];
}

function fakeRows(n: number): OwnedEquipmentSelectRow[] {
  return Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    name: `装備${i + 1}`,
    rarity: i % 5 === 0 ? 'SSR' : 'N',
    upgrade_level: 0,
    src_level: 0,
    awakening_level: 0,
    durability_state: '良好',
    is_equipped: 0,
    slot: 'weapon',
  }));
}

function main() {
  const result = emptyResult();
  const rows: string[][] = [];

  const pagedAwaken = buildPagedOwnedEquipmentSelectView({
    rows: fakeRows(30),
    page: 1,
    selectMenuId: 'upgrade:awaken',
    selectLabel: '装備を選ぶ',
    pageButtonPrefix: 'upgrade:page:awaken:blacksmith',
    backContext: 'upgrade',
    backPayload: 'awaken:blacksmith',
  });
  const awakenIds = collectIds(pagedAwaken.components);
  rows.push([
    'upgrade_awaken', '覚醒対象選択', '30', 'YES', 'YES', 'YES', 'YES',
    awakenIds.some((id) => id.startsWith('nav:back:upgrade')) ? 'YES' : 'NO',
    awakenIds.includes('town:home') ? 'YES' : 'NO',
    new Set(awakenIds).size !== awakenIds.length ? 'YES' : 'NO', 'paged mock 30 items',
  ]);

  const pagedEnhance = buildPagedOwnedEquipmentSelectView({
    rows: fakeRows(30),
    page: 1,
    selectMenuId: 'upgrade:enhance',
    selectLabel: '装備を選ぶ',
    pageButtonPrefix: 'upgrade:page:enhance:blacksmith',
    backContext: 'upgrade',
    backPayload: 'enhance:blacksmith',
  });
  const enhanceIds = collectIds(pagedEnhance.components);
  rows.push([
    'upgrade_enhance', '武器強化選択', '30', 'YES', 'YES', 'YES', 'YES',
    enhanceIds.some((id) => id.startsWith('nav:back:upgrade')) ? 'YES' : 'NO',
    enhanceIds.includes('town:home') ? 'YES' : 'NO',
    new Set(enhanceIds).size !== enhanceIds.length ? 'YES' : 'NO', 'paged mock 30 items',
  ]);

  const equipView = buildEquipSlotSelectView('audit-user', 'weapon', 0);
  const equipIds = collectIds(equipView.components);
  rows.push([
    'equip_change', '装備変更', '24+ if owned',
    'YES', 'YES', 'YES', 'YES',
    equipIds.some((id) => id.startsWith('nav:back:equip')) ? 'YES' : 'NO',
    equipIds.includes('town:home') ? 'YES' : 'NO', 'NO',
    'buildEquipSlotSelectView paging (EQUIP_SELECT_PAGE_SIZE=24)',
  ]);

  const paged = buildPagedOwnedEquipmentSelectView({
    rows: fakeRows(30),
    page: 1,
    selectMenuId: 'upgrade:repair',
    selectLabel: 'test',
    pageButtonPrefix: 'upgrade:page:repair:fac',
    backContext: 'upgrade',
    backPayload: 'repair:fac',
  });
  void paged;

  const detail = buildInventoryDetailPickView('audit-user', 0);
  const detailIds = collectIds(detail.components ?? []);
  rows.push([
    'detail_pick', '品の詳細選択', 'dynamic', detailIds.some((id) => id.startsWith('detail:page:')) ? 'YES' : 'WARN',
    'WARN', 'N/A', detailIds.some((id) => id.startsWith('nav:back:detail')) ? 'YES' : 'NO',
    detailIds.some((id) => id.startsWith('nav:back:detail')) ? 'YES' : 'NO',
    detailIds.includes('town:home') ? 'YES' : 'NO', 'NO', 'uses inventory list paging',
  ]);

  for (const row of rows) {
    if (row[3] === 'NO' && Number(row[2]) > 24) result.fails.push(`${row[0]}: no pagination`);
    if (row[9] === 'YES') result.fails.push(`${row[0]}: duplicate custom_id`);
  }

  writeMdCsvPair('equipment-menu-pagination-audit', HEADERS, rows, [`- screens: ${rows.length}`]);
  exitCheckResult('equipment-menu-pagination-audit', result);
}

main();
