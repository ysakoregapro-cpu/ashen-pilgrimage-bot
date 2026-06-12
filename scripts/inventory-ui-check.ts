/** inventory-ui-check — npx tsx scripts/inventory-ui-check.ts */
import { readFileSync } from 'fs';
import { join } from 'path';
import { getDb } from '../src/db/database';
import { ensurePhase2Seed } from '../src/db/seedData/phase2Seed';
import {
  getInventoryListItems,
  buildInventoryView,
  buildInventoryPickView,
  INVENTORY_PAGE_SIZE,
} from '../src/utils/inventoryUi';
import { errorRecoveryPayload } from '../src/utils/nextActionButtons';
import { createPlayer, getPlayer } from '../src/systems/playerSystem';
import { addItem } from '../src/systems/inventorySystem';
import {
  findDuplicateCustomIds,
  findSelectMenuIssues,
  sanitizeComponents,
} from '../src/utils/componentSafety';

const TEST_USER = 'inventory-ui-check-user';
const issues: string[] = [];

function clearInventory(userId: string): void {
  getDb().prepare('DELETE FROM player_inventory WHERE user_id = ?').run(userId);
}

function seedDistinctRows(userId: string, count: number): void {
  clearInventory(userId);
  const mats = [
    'mat_iron_scrap', 'mat_old_wood', 'mat_cloth_scrap', 'mat_beast_fang', 'mat_beast_hide',
    'mat_small_mana', 'mat_dry_herb', 'mat_cracked_bone', 'mat_starfield_grass', 'mat_twilight_shell',
    'mat_silver_ore', 'mat_mist_leaf', 'mat_moon_ink', 'mat_forgotten_sand', 'mat_hourglass_shard',
    'mat_ash_crest', 'mat_dragonbone', 'mat_silent_holy', 'mat_deep_soot', 'mat_starfall_shard',
    'dism_rust_iron', 'dism_old_leather', 'dism_torn_cloth', 'dism_starfield_cloth', 'dism_silver_plate',
    'dism_mist_thread', 'dism_moon_fiber', 'dism_ash_steel',
  ];
  for (let i = 0; i < count; i++) addItem(userId, mats[i % mats.length]!, 1);
}

function assert(cond: boolean, msg: string): void {
  if (!cond) issues.push(msg);
}

function checkPayload(label: string, payload: ReturnType<typeof buildInventoryView>, opts?: {
  expectSelect?: boolean;
  expectPaging?: boolean;
}): void {
  const dupes = findDuplicateCustomIds(payload.components);
  if (dupes.size) {
    for (const [id] of dupes) issues.push(`${label}: duplicate custom_id "${id}"`);
  }
  for (const si of findSelectMenuIssues(payload.components)) {
    issues.push(`${label}: select ${si.kind} (${si.optionCount})`);
  }
  const sanitized = sanitizeComponents(payload.components, label);
  assert(findDuplicateCustomIds(sanitized).size === 0, `${label}: sanitize failed`);

  const hasSelect = payload.components.some((r) => r.toJSON().components.some((c) => c.type === 3));
  if (opts?.expectSelect === false) assert(!hasSelect, `${label}: empty inventory must not show select`);
  if (opts?.expectSelect === true) assert(hasSelect, `${label}: select missing`);
  if (opts?.expectPaging === true) {
    const ids = payload.components.flatMap((r) => r.toJSON().components.map((c) => ('custom_id' in c ? c.custom_id : '')));
    assert(ids.some((id) => String(id).startsWith('inventory:page:')), `${label}: paging missing`);
  }
}

function main(): void {
  ensurePhase2Seed(getDb());
  if (!getPlayer(TEST_USER)) createPlayer(TEST_USER, 'g', 'Test', 'c');
  clearInventory(TEST_USER);

  checkPayload('0件', buildInventoryView(TEST_USER, 0), { expectSelect: false });
  assert(buildInventoryView(TEST_USER, 0).embeds.length > 0, '空所持品embedなし');

  addItem(TEST_USER, 'mat_iron_scrap', 1);
  checkPayload('1件', buildInventoryView(TEST_USER, 0), { expectSelect: true });

  clearInventory(TEST_USER);
  seedDistinctRows(TEST_USER, 25);
  const items25 = getInventoryListItems(TEST_USER, { page: 0, pageSize: INVENTORY_PAGE_SIZE });
  assert(items25.total === 25, `25件 seed: got ${items25.total}`);
  checkPayload('25件', buildInventoryView(TEST_USER, 0), { expectSelect: true });

  seedDistinctRows(TEST_USER, 26);
  const items26 = getInventoryListItems(TEST_USER, { page: 0, pageSize: INVENTORY_PAGE_SIZE });
  assert(items26.totalPages === 2, '26件で2ページにならない');
  checkPayload('26件 p0', buildInventoryView(TEST_USER, 0), { expectSelect: true, expectPaging: true });
  checkPayload('26件 p1', buildInventoryView(TEST_USER, 1), { expectSelect: true, expectPaging: true });

  clearInventory(TEST_USER);
  seedDistinctRows(TEST_USER, 50);
  checkPayload('50件', buildInventoryView(TEST_USER, 0), { expectSelect: true, expectPaging: true });

  clearInventory(TEST_USER);
  addItem(TEST_USER, 'mat_iron_scrap', 1);
  const pick = buildInventoryPickView(TEST_USER, 0);
  assert(findDuplicateCustomIds(pick.components).size === 0, 'pick view duplicate custom_id');

  const mf = readFileSync(join(process.cwd(), 'src/utils/messageFlow.ts'), 'utf8');
  assert(mf.includes('sanitizeComponents'), 'messageFlow: sanitizeComponents 未使用');
  assert(mf.includes('replyEphemeralNoChannel'), 'messageFlow: channel null 安全応答なし');

  const recovery = errorRecoveryPayload('道しるべが乱れた。もう一度開き直してください。');
  assert(recovery.components.length > 0, 'errorRecoveryPayload 戻り導線なし');

  clearInventory(TEST_USER);

  if (issues.length) {
    console.error('❌ inventory-ui-check failed:');
    for (const i of issues) console.error('  -', i);
    process.exit(1);
  }
  console.log('✅ inventory-ui-check passed');
}

main();
