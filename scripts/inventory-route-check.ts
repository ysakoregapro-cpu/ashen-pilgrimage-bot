/** inventory-route-check — npx tsx scripts/inventory-route-check.ts */
import { readFileSync } from 'fs';
import { join } from 'path';
import { getDb } from '../src/db/database';
import { ensurePhase2Seed } from '../src/db/seedData/phase2Seed';
import { buildInventoryView, buildInventoryPickView } from '../src/utils/inventoryUi';
import { createPlayer, getPlayer } from '../src/systems/playerSystem';
import { addItem } from '../src/systems/inventorySystem';
import {
  collectComponentCustomIds,
  findDuplicateCustomIds,
  findSelectMenuIssues,
  sanitizeComponents,
} from '../src/utils/componentSafety';
import { formatEnemyDisplayName } from '../src/systems/enemyBattleState';
import type { ActionRowBuilder, MessageActionRowComponentBuilder } from 'discord.js';

const TEST_USER = 'inventory-route-check-user';
const issues: string[] = [];

type RouteCase = {
  name: string;
  build: () => ActionRowBuilder<MessageActionRowComponentBuilder>[];
  expectSelect?: boolean;
  expectPaging?: boolean;
};

function clearInventory(userId: string): void {
  getDb().prepare('DELETE FROM player_inventory WHERE user_id = ?').run(userId);
}

const MAT_POOL = [
  'mat_iron_scrap', 'mat_old_wood', 'mat_cloth_scrap', 'mat_beast_fang', 'mat_beast_hide',
  'mat_small_mana', 'mat_dry_herb', 'mat_cracked_bone', 'mat_starfield_grass', 'mat_twilight_shell',
  'mat_silver_ore', 'mat_mist_leaf', 'mat_moon_ink', 'mat_forgotten_sand', 'mat_hourglass_shard',
  'mat_ash_crest', 'mat_dragonbone', 'mat_silent_holy', 'mat_deep_soot', 'mat_starfall_shard',
  'dism_rust_iron', 'dism_old_leather', 'dism_torn_cloth', 'dism_starfield_cloth', 'dism_silver_plate',
  'dism_mist_thread', 'dism_moon_fiber', 'dism_ash_steel',
];

function seedDistinctRows(userId: string, count: number, mix = false): void {
  clearInventory(userId);
  if (count === 0) return;
  const db = getDb();
  const eq = db.prepare("SELECT id FROM items WHERE category = 'equipment' LIMIT 10").all() as Array<{ id: string }>;
  const con = db.prepare("SELECT id FROM items WHERE category = 'consumable' LIMIT 10").all() as Array<{ id: string }>;
  for (let i = 0; i < count; i++) {
    if (mix && i % 3 === 1 && eq.length) addItem(userId, eq[i % eq.length]!.id, 1);
    else if (mix && i % 3 === 2 && con.length) addItem(userId, con[i % con.length]!.id, 1);
    else addItem(userId, MAT_POOL[i % MAT_POOL.length]!, 1);
  }
}

function assert(cond: boolean, msg: string): void {
  if (!cond) issues.push(msg);
}

function checkComponents(label: string, components: ActionRowBuilder<MessageActionRowComponentBuilder>[], opts?: {
  expectSelect?: boolean;
  expectPaging?: boolean;
}): void {
  const dupes = findDuplicateCustomIds(components);
  if (dupes.size) {
    for (const [id, locs] of dupes) {
      issues.push(`${label}: duplicate custom_id "${id}" at ${locs.map((l) => `r${l.rowIndex}c${l.colIndex}`).join(', ')}`);
    }
  }

  const selectIssues = findSelectMenuIssues(components);
  for (const si of selectIssues) {
    issues.push(`${label}: select "${si.customId}" ${si.kind} (${si.optionCount} options)`);
  }

  const hasSelect = components.some((r) =>
    r.toJSON().components.some((c) => c.type === 3),
  );
  if (opts?.expectSelect === false && hasSelect) {
    issues.push(`${label}: select menu should not appear`);
  }
  if (opts?.expectSelect === true && !hasSelect) {
    issues.push(`${label}: select menu missing`);
  }

  const hasPageNav = collectComponentCustomIds(components).some((l) => l.customId.startsWith('inventory:page:'));
  if (opts?.expectPaging === true && !hasPageNav) {
    issues.push(`${label}: paging buttons missing`);
  }
  if (opts?.expectPaging === false && hasPageNav) {
    issues.push(`${label}: paging buttons should not appear`);
  }

  const sanitized = sanitizeComponents(components, label);
  const sanitizedDupes = findDuplicateCustomIds(sanitized);
  assert(sanitizedDupes.size === 0, `${label}: sanitizeComponents left duplicates`);
}

function routeCases(): RouteCase[] {
  return [
    {
      name: '町→所持品 (0件)',
      build: () => {
        seedDistinctRows(TEST_USER, 0);
        return buildInventoryView(TEST_USER, 0).components;
      },
      expectSelect: false,
    },
    {
      name: '町→所持品 (1件)',
      build: () => {
        seedDistinctRows(TEST_USER, 1);
        return buildInventoryView(TEST_USER, 0).components;
      },
      expectSelect: true,
    },
    {
      name: '所持品 (25件)',
      build: () => {
        seedDistinctRows(TEST_USER, 25, true);
        return buildInventoryView(TEST_USER, 0).components;
      },
      expectSelect: true,
    },
    {
      name: '所持品 (26件・ページ1)',
      build: () => {
        seedDistinctRows(TEST_USER, 26, true);
        return buildInventoryView(TEST_USER, 0).components;
      },
      expectSelect: true,
      expectPaging: true,
    },
    {
      name: '所持品 (26件・ページ2)',
      build: () => {
        seedDistinctRows(TEST_USER, 26, true);
        return buildInventoryView(TEST_USER, 1).components;
      },
      expectSelect: true,
      expectPaging: true,
    },
    {
      name: '所持品 (50件以上)',
      build: () => {
        seedDistinctRows(TEST_USER, 55, true);
        return buildInventoryView(TEST_USER, 0).components;
      },
      expectSelect: true,
      expectPaging: true,
    },
    {
      name: '探索後→所持品',
      build: () => {
        seedDistinctRows(TEST_USER, 3, true);
        return buildInventoryView(TEST_USER, 0).components;
      },
      expectSelect: true,
    },
    {
      name: '戦闘後→所持品',
      build: () => {
        seedDistinctRows(TEST_USER, 3, true);
        return buildInventoryView(TEST_USER, 0).components;
      },
      expectSelect: true,
    },
    {
      name: '施設後→所持品',
      build: () => {
        seedDistinctRows(TEST_USER, 3, true);
        return buildInventoryView(TEST_USER, 0).components;
      },
      expectSelect: true,
    },
    {
      name: 'ショップ後→所持品',
      build: () => {
        seedDistinctRows(TEST_USER, 3, true);
        return buildInventoryView(TEST_USER, 0).components;
      },
      expectSelect: true,
    },
    {
      name: '品詳細ピック (混在)',
      build: () => {
        seedDistinctRows(TEST_USER, 10, true);
        return buildInventoryPickView(TEST_USER, 0).components;
      },
      expectSelect: true,
    },
    {
      name: '同名アイテム大量',
      build: () => {
        clearInventory(TEST_USER);
        for (let i = 0; i < 30; i++) addItem(TEST_USER, 'mat_iron_scrap', 1);
        return buildInventoryView(TEST_USER, 0).components;
      },
      expectSelect: true,
    },
  ];
}

function checkEnemyLabels(): void {
  const single = formatEnemyDisplayName({
    instance_id: 'e1', label: 'A', monster_id: 'm', name: '漂流亡者',
    hp: 1, max_hp: 1, break: 0, break_max: 1, is_alive: true, position: 0, status: {},
    combatScale: {} as never, threatTier: 'normal',
  }, 1);
  assert(!single.includes('A:'), `単体戦 label: got "${single}"`);

  const multi = formatEnemyDisplayName({
    instance_id: 'e1', label: 'B', monster_id: 'm', name: '海賊', hp: 1, max_hp: 1,
    break: 0, break_max: 1, is_alive: true, position: 0, status: {},
    combatScale: {} as never, threatTier: 'normal',
  }, 2);
  assert(multi.startsWith('B:'), `複数戦 label: got "${multi}"`);
}

function checkAreaDisplayText(): void {
  const src = readFileSync(join(process.cwd(), 'src/systems/areaDisplaySystem.ts'), 'utf8');
  assert(!src.includes('町共通プール'), 'areaDisplaySystem に「町共通プール」が残っている');
}

function main(): void {
  ensurePhase2Seed(getDb());
  if (!getPlayer(TEST_USER)) createPlayer(TEST_USER, 'g', 'RouteTest', 'c');

  console.log('## inventory-route-check\n');

  for (const c of routeCases()) {
    const components = c.build();
    checkComponents(c.name, components, { expectSelect: c.expectSelect, expectPaging: c.expectPaging });
    console.log(`✓ ${c.name} (${components.length} rows)`);
  }

  checkEnemyLabels();
  checkAreaDisplayText();

  clearInventory(TEST_USER);

  if (issues.length) {
    console.error('\n❌ inventory-route-check failed:');
    for (const i of issues) console.error('  -', i);
    process.exit(1);
  }
  console.log('\n✅ inventory-route-check passed');
}

main();
