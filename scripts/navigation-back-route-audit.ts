/** navigation-back-route-audit — npx tsx scripts/navigation-back-route-audit.ts */
import { getDb } from '../src/db/database';
import { ensureMaterialsSeed } from '../src/db/seedData/materials';
import { ensurePhase2Seed } from '../src/db/seedData/phase2Seed';
import { ensureMasterDataSeed } from '../src/db/seedData/masterDataSeed';
import { createPlayer, getPlayer } from '../src/systems/playerSystem';
import { addItem } from '../src/systems/inventorySystem';
import { buildExploreList, buildTravelList } from '../src/systems/townActionSystem';
import { buildEquipSlotSelectView } from '../src/systems/equipmentSystem';
import { buildPrepSlotSelectComponents } from '../src/systems/prepSystem';
import { buildUpgradeSelectPayload } from '../src/systems/upgradeConfirmSystem';
import { buildInventoryPickView } from '../src/utils/inventoryUi';
import { buildShopDetailPickView } from '../src/systems/itemDetailSystem';
import {
  collectComponentCustomIds,
  findDuplicateCustomIds,
  sanitizeComponents,
} from '../src/utils/componentSafety';
import { writeReport, writeCsv, mdTable } from './audit/reportWriter';
import type { ActionRowBuilder, MessageActionRowComponentBuilder } from 'discord.js';

const TEST_USER = 'navigation-back-route-audit-user';

const HEADERS = [
  'screen_id', 'screen_name', 'has_select_menu', 'has_back_button', 'has_town_button',
  'back_target', 'town_target', 'component_rows', 'duplicate_custom_id', 'balance_note',
];

type ScreenSpec = { id: string; name: string; build: () => ActionRowBuilder<MessageActionRowComponentBuilder>[] };

function hasButton(components: ActionRowBuilder<MessageActionRowComponentBuilder>[], label: string): boolean {
  return components.some((r) => r.toJSON().components.some((c) => c.type === 2 && c.label === label));
}

function hasSelect(components: ActionRowBuilder<MessageActionRowComponentBuilder>[]): boolean {
  return components.some((r) => r.toJSON().components.some((c) => c.type === 3));
}

function backTarget(components: ActionRowBuilder<MessageActionRowComponentBuilder>[]): string {
  for (const r of components) {
    for (const c of r.toJSON().components) {
      if (c.type === 2 && c.custom_id?.startsWith('nav:back:')) return c.custom_id;
    }
  }
  return '';
}

function auditScreen(spec: ScreenSpec): string[] {
  const components = sanitizeComponents(spec.build(), spec.id) as ActionRowBuilder<MessageActionRowComponentBuilder>[];
  const dupes = findDuplicateCustomIds(components);
  const dupeStr = dupes.size ? [...dupes.keys()].join(';') : 'no';
  const rows = components.length;
  const note = rows > 5 ? 'NG — >5 rows' : dupeStr !== 'no' ? 'NG — duplicate ids' : 'OK';
  return [
    spec.id,
    spec.name,
    hasSelect(components) ? 'yes' : 'no',
    hasButton(components, 'ひとつ戻る') ? 'yes' : 'no',
    hasButton(components, '街に戻る') ? 'yes' : 'no',
    backTarget(components),
    'town:home',
    String(rows),
    dupeStr,
    note,
  ];
}

function main() {
  const db = getDb();
  ensureMaterialsSeed(db);
  ensurePhase2Seed(db);
  ensureMasterDataSeed(db);
  if (!getPlayer(TEST_USER)) {
    createPlayer(TEST_USER, 'guild-nav-route', 'NavRoute', 'ch-nav-route');
  }
  addItem(TEST_USER, 'wpn_traveler_sword', 1);

  const screens: ScreenSpec[] = [
    { id: 'explore_list', name: '探索先選択', build: () => buildExploreList(TEST_USER).components as ActionRowBuilder<MessageActionRowComponentBuilder>[] },
    { id: 'travel_list', name: '別の町へ', build: () => buildTravelList(TEST_USER).components as ActionRowBuilder<MessageActionRowComponentBuilder>[] },
    { id: 'equip_select', name: '装備変更', build: () => buildEquipSlotSelectView(TEST_USER, 'weapon').components },
    { id: 'prep_select', name: '身支度装備', build: () => buildPrepSlotSelectComponents(TEST_USER, 'weapon') },
    { id: 'upgrade_enhance', name: '装備強化選択', build: () => buildUpgradeSelectPayload(TEST_USER, 'enhance', 'blacksmith_starfield').components as ActionRowBuilder<MessageActionRowComponentBuilder>[] },
    { id: 'inventory_detail', name: '品の詳細', build: () => buildInventoryPickView(TEST_USER).components as ActionRowBuilder<MessageActionRowComponentBuilder>[] },
    { id: 'shop_detail_buy', name: 'ショップ詳細', build: () => buildShopDetailPickView(TEST_USER, 'start_starfield', 'buy').components as ActionRowBuilder<MessageActionRowComponentBuilder>[] },
  ];

  const rows = screens.map(auditScreen);
  const ng = rows.filter((r) => r[9]?.startsWith('NG'));
  const missingNav = rows.filter((r) => r[3] === 'no' && r[4] === 'no');

  const md = [
    '# Navigation Back Route Audit',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    mdTable(HEADERS, rows),
    '',
    `NG: ${ng.length}, missing both nav: ${missingNav.length}`,
  ].join('\n');

  writeReport('navigation-back-route-audit.md', md);
  writeCsv('navigation-back-route-audit.csv', HEADERS, rows);
  console.log(`✅ navigation-back-route-audit → ${screens.length} screens, ${ng.length} NG`);
  if (ng.length || missingNav.length) {
    console.error('❌ navigation-back-route-audit failed');
    process.exit(1);
  }
}

main();
