/** equipment-selection-label-check — npx tsx scripts/equipment-selection-label-check.ts */
import { getDb } from '../src/db/database';
import { ensureMaterialsSeed } from '../src/db/seedData/materials';
import { ensurePhase2Seed } from '../src/db/seedData/phase2Seed';
import { ensureMasterDataSeed } from '../src/db/seedData/masterDataSeed';
import { createPlayer, getPlayer } from '../src/systems/playerSystem';
import { addItem } from '../src/systems/inventorySystem';
import { equipItem } from '../src/systems/equipmentSystem';
import { buildPrepEquipSelectOptions } from '../src/systems/prepSystem';
import {
  buildEquipChangeSelectOptions,
  formatOwnedEquipmentLabel,
  isEquipNoneValue,
  mapInventoryRowToEquipmentSelect,
  toOwnedEquipmentSelectOption,
} from '../src/systems/equipmentLabelSystem';
import { getUpgradeSelectMenuOptions } from '../src/systems/facilitySystem';
import { buildInventoryPickView } from '../src/utils/inventoryUi';
import { selectMenu } from '../src/utils/embeds';
import {
  collectComponentCustomIds,
  findDuplicateCustomIds,
  findSelectMenuIssues,
} from '../src/utils/componentSafety';
import type { ActionRowBuilder, MessageActionRowComponentBuilder } from 'discord.js';

const TEST_USER = 'equipment-selection-label-check-user';
const issues: string[] = [];

function assert(cond: boolean, msg: string): void {
  if (!cond) issues.push(msg);
}

function initDb() {
  const db = getDb();
  ensureMaterialsSeed(db);
  ensurePhase2Seed(db);
  ensureMasterDataSeed(db);
  return db;
}

function clearPlayer(userId: string): void {
  getDb().prepare('DELETE FROM player_inventory WHERE user_id = ?').run(userId);
  getDb().prepare('DELETE FROM player_equipment WHERE user_id = ?').run(userId);
}

function checkSelect(label: string, components: ActionRowBuilder<MessageActionRowComponentBuilder>[]): void {
  const dupes = findDuplicateCustomIds(components);
  for (const [id, locs] of dupes) {
    issues.push(`${label}: duplicate custom_id "${id}" at ${locs.map((l) => `r${l.rowIndex}c${l.colIndex}`).join(', ')}`);
  }
  for (const si of findSelectMenuIssues(components)) {
    issues.push(`${label}: select "${si.customId}" ${si.kind} (${si.optionCount} options)`);
  }
}

function checkOptionValues(label: string, options: Array<{ label: string; value: string; description?: string }>): void {
  if (!options.length) {
    issues.push(`${label}: options empty`);
    return;
  }
  if (options.length > 25) issues.push(`${label}: options exceed 25 (${options.length})`);
  const values = options.map((o) => o.value);
  const unique = new Set(values);
  assert(unique.size === values.length, `${label}: duplicate select values`);
  for (const o of options) {
    if (o.value === 'none' || o.value.startsWith('none:')) continue;
    assert(/^\d+$/.test(o.value), `${label}: non-instance value "${o.value}"`);
  }
}

function main() {
  initDb();
  if (!getPlayer(TEST_USER)) {
    createPlayer(TEST_USER, 'guild-check', 'LabelCheck', 'ch-check');
  }
  clearPlayer(TEST_USER);

  const db = getDb();
  const swordId = 'wpn_traveler_sword';
  const inv1 = addItem(TEST_USER, swordId, 1);
  const inv2 = addItem(TEST_USER, swordId, 1);
  db.prepare('UPDATE player_inventory SET upgrade_level = 3, awakening_level = 2, durability_state = ? WHERE id = ?')
    .run('損傷', inv1);
  db.prepare('UPDATE player_inventory SET upgrade_level = 0, awakening_level = 0, durability_state = ? WHERE id = ?')
    .run('良好', inv2);
  equipItem(TEST_USER, inv1);

  const rows = db.prepare(`
    SELECT pi.id, i.name, i.rarity, pi.upgrade_level, pi.src_level, pi.awakening_level,
      pi.durability_state, pi.is_equipped, e.slot
    FROM player_inventory pi
    JOIN items i ON pi.item_id = i.id
    JOIN equipment e ON pi.item_id = e.item_id
    WHERE pi.user_id = ? AND e.slot = 'weapon'
  `).all(TEST_USER) as Array<Record<string, unknown>>;

  assert(rows.length >= 2, 'need duplicate weapon instances');

  const mapped = rows.map((r) => mapInventoryRowToEquipmentSelect({
    id: r.id as number,
    name: r.name as string,
    rarity: r.rarity as string,
    upgrade_level: r.upgrade_level as number,
    src_level: (r.src_level as number) ?? 0,
    awakening_level: (r.awakening_level as number) ?? 0,
    durability_state: r.durability_state as string,
    is_equipped: r.is_equipped as number,
    slot: r.slot as string,
  }));

  const labels = mapped.map((r) => formatOwnedEquipmentLabel(r));
  assert(labels[0] !== labels[1], 'duplicate labels for same-name gear with different +/awakening');
  assert(labels.some((l) => l.includes('+3')), 'upgrade stage missing in label');
  assert(labels.some((l) => l.includes('覚醒II')), 'awakening stage missing in label');
  assert(mapped.some((r) => toOwnedEquipmentSelectOption(r).description?.includes('装備中')), 'equipped badge missing');
  assert(mapped.some((r) => toOwnedEquipmentSelectOption(r).description?.includes('故障中')), 'durability badge missing');

  const equipOpts = buildEquipChangeSelectOptions('weapon', mapped);
  checkOptionValues('equip change', equipOpts);
  assert(equipOpts[0]?.label === '装備無し', 'equip change missing 装備無し at head');
  assert(isEquipNoneValue(equipOpts[0]!.value), 'none value not recognized');

  const prepOpts = buildPrepEquipSelectOptions(TEST_USER, 'weapon');
  checkOptionValues('prep equip', prepOpts);
  assert(prepOpts[0]?.label === '装備無し', 'prep equip missing 装備無し');

  const prepComponents = [
    selectMenu('prep:equip', '装備を選ぶ', prepOpts),
    selectMenu('detail:inv', '詳細を見る', prepOpts.filter((o) => !o.value.startsWith('none'))),
  ];
  checkSelect('prep dual select', prepComponents);
  const prepIds = collectComponentCustomIds(prepComponents).map((c) => c.customId);
  assert(new Set(prepIds).size === prepIds.length, 'prep custom_id collision');

  const upgradeOpts = getUpgradeSelectMenuOptions(TEST_USER, 'enhance');
  if (upgradeOpts.length) {
    checkOptionValues('facility enhance', upgradeOpts);
    assert(upgradeOpts.every((o) => o.label.includes('+') || o.label.includes('Src+')), 'upgrade label missing + stage');
  }

  const invView = buildInventoryPickView(TEST_USER, 0, 'equipment');
  checkSelect('inventory equipment pick', invView.components as ActionRowBuilder<MessageActionRowComponentBuilder>[]);
  const invSelect = invView.components.find((r) =>
    r.toJSON().components.some((c) => c.type === 3 && c.custom_id === 'detail:inv'),
  );
  if (invSelect) {
    const opts = invSelect.toJSON().components[0]!.options ?? [];
    checkOptionValues('inventory detail:inv', opts.map((o) => ({
      label: o.label ?? '',
      value: o.value ?? '',
      description: o.description,
    })));
  }

  if (issues.length) {
    console.error('❌ equipment-selection-label-check failed:');
    for (const i of issues) console.error('  -', i);
    process.exit(1);
  }
  console.log('✅ equipment-selection-label-check passed');
}

main();
