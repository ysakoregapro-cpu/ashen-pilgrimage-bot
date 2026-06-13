/** prep-equipment-slot-check — npx tsx scripts/prep-equipment-slot-check.ts */
import { getDb } from '../src/db/database';
import { ensureMaterialsSeed } from '../src/db/seedData/materials';
import { ensurePhase2Seed } from '../src/db/seedData/phase2Seed';
import { ensureMasterDataSeed } from '../src/db/seedData/masterDataSeed';
import { createPlayer, getPlayer } from '../src/systems/playerSystem';
import { addItem } from '../src/systems/inventorySystem';
import {
  PREP_SLOTS,
  buildPrepEquipSelectOptions,
  buildPrepSlotSelectComponents,
  buildPrepEquipConfirmView,
} from '../src/systems/prepSystem';
import { buildEquipNoneConfirmPayload } from '../src/systems/equipConfirmSystem';
import { isEquipNoneValue, parseEquipNoneSlot } from '../src/systems/equipmentLabelSystem';
import {
  findDuplicateCustomIds,
  findSelectMenuIssues,
  sanitizeComponents,
} from '../src/utils/componentSafety';
import type { EquipmentSlot } from '../src/types';
import type { ActionRowBuilder, MessageActionRowComponentBuilder } from 'discord.js';

const TEST_USER = 'prep-equipment-slot-check-user';
const fails: string[] = [];

function assert(cond: boolean, msg: string) {
  if (!cond) fails.push(msg);
}

function slotSampleItem(slot: EquipmentSlot): string | null {
  const db = getDb();
  const row = db.prepare(`
    SELECT e.item_id FROM equipment e
    JOIN items i ON e.item_id = i.id
    WHERE e.slot = ? AND i.rarity IN ('N','R','SR')
    ORDER BY i.rarity, e.item_id LIMIT 1
  `).get(slot) as { item_id: string } | undefined;
  return row?.item_id ?? null;
}

function checkComponents(label: string, components: ActionRowBuilder<MessageActionRowComponentBuilder>[]) {
  const sanitized = sanitizeComponents(components, label);
  const dupes = findDuplicateCustomIds(sanitized);
  for (const [id] of dupes) {
    fails.push(`${label}: duplicate custom_id after sanitize: ${id}`);
  }
  for (const issue of findSelectMenuIssues(sanitized)) {
    fails.push(`${label}: select ${issue.customId} ${issue.kind}`);
  }
}

function main() {
  const db = getDb();
  ensureMaterialsSeed(db);
  ensurePhase2Seed(db);
  ensureMasterDataSeed(db);

  if (!getPlayer(TEST_USER)) {
    createPlayer(TEST_USER, 'prep-check-guild', 'PrepCheck', 'ch-prep');
  }
  db.prepare('DELETE FROM player_inventory WHERE user_id = ?').run(TEST_USER);
  db.prepare('DELETE FROM player_equipment WHERE user_id = ?').run(TEST_USER);
  db.prepare('UPDATE players SET level = 80 WHERE user_id = ?').run(TEST_USER);

  for (const slot of PREP_SLOTS) {
    const itemId = slotSampleItem(slot);
    if (itemId) {
      addItem(TEST_USER, itemId, 1);
    }

    const pickOpts = buildPrepEquipSelectOptions(TEST_USER, slot);
    assert(pickOpts.length >= 1, `${slot}: no prep equip options`);
    assert(pickOpts.some((o) => isEquipNoneValue(o.value)), `${slot}: missing 装備無し option`);

    const slotComponents = buildPrepSlotSelectComponents(TEST_USER, slot);
    checkComponents(`${slot}:slot`, slotComponents);

    const equipOpt = pickOpts.find((o) => !o.value.startsWith('none'));
    if (equipOpt) {
      const invId = Number(equipOpt.value);
      assert(Number.isFinite(invId), `${slot}: equip value not inventory id`);
      const confirm = buildPrepEquipConfirmView(TEST_USER, invId, slot);
      checkComponents(`${slot}:confirm`, confirm.components);
    }

    const noneOpt = pickOpts.find((o) => isEquipNoneValue(o.value));
    if (noneOpt) {
      const noneSlot = parseEquipNoneSlot(noneOpt.value, slot);
      assert(noneSlot === slot, `${slot}: parseEquipNoneSlot mismatch`);
      const nonePayload = buildEquipNoneConfirmPayload(TEST_USER, noneSlot!, 'prep');
      checkComponents(`${slot}:none-confirm`, nonePayload.components);
    }

    db.prepare('DELETE FROM player_inventory WHERE user_id = ?').run(TEST_USER);
  }

  console.log('## prep-equipment-slot-check\n');
  if (fails.length) {
    console.error('FAIL');
    for (const f of fails) console.error(`- ${f}`);
    process.exit(1);
  }
  console.log(`OK — ${PREP_SLOTS.length} slots: slot pick, equip confirm, none confirm; sanitizeComponents clean`);
}

main();
