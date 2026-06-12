/** navigation-back-flow-check — npx tsx scripts/navigation-back-flow-check.ts */
import { getDb } from '../src/db/database';
import { ensureMaterialsSeed } from '../src/db/seedData/materials';
import { ensurePhase2Seed } from '../src/db/seedData/phase2Seed';
import { ensureMasterDataSeed } from '../src/db/seedData/masterDataSeed';
import { createPlayer, getPlayer } from '../src/systems/playerSystem';
import { addItem } from '../src/systems/inventorySystem';
import { buildAreaDetailView } from '../src/systems/townActionSystem';
import { buildUpgradeConfirmPayload } from '../src/systems/upgradeConfirmSystem';
import { buildEquipNoneConfirmPayload, buildEquipChangeConfirmRows } from '../src/systems/equipConfirmSystem';
import { buildNavBackPayload } from '../src/systems/navHandlerSystem';
import { nextActionButtons } from '../src/utils/nextActionButtons';
import {
  collectComponentCustomIds,
  findDuplicateCustomIds,
  findSelectMenuIssues,
  sanitizeComponents,
} from '../src/utils/componentSafety';
import type { ActionRowBuilder, MessageActionRowComponentBuilder } from 'discord.js';

const TEST_USER = 'navigation-back-flow-check-user';
const issues: string[] = [];

function assert(cond: boolean, msg: string): void {
  if (!cond) issues.push(msg);
}

function initDb() {
  const db = getDb();
  ensureMaterialsSeed(db);
  ensurePhase2Seed(db);
  ensureMasterDataSeed(db);
}

function checkComponents(label: string, components: ActionRowBuilder<MessageActionRowComponentBuilder>[]): void {
  const sanitized = sanitizeComponents(components, label) as ActionRowBuilder<MessageActionRowComponentBuilder>[];
  const dupes = findDuplicateCustomIds(sanitized);
  for (const [id, locs] of dupes) {
    issues.push(`${label}: duplicate custom_id "${id}" at ${locs.map((l) => `r${l.rowIndex}c${l.colIndex}`).join(', ')}`);
  }
  for (const si of findSelectMenuIssues(sanitized)) {
    issues.push(`${label}: select "${si.customId}" ${si.kind} (${si.optionCount} options)`);
  }
}

function buttonLabels(components: ActionRowBuilder<MessageActionRowComponentBuilder>[]): string[] {
  return components.flatMap((r) =>
    r.toJSON().components.filter((c) => c.type === 2).map((c) => c.label ?? ''),
  );
}

function buttonIds(components: ActionRowBuilder<MessageActionRowComponentBuilder>[]): string[] {
  return collectComponentCustomIds(components).map((c) => c.customId);
}

function main() {
  initDb();
  if (!getPlayer(TEST_USER)) {
    createPlayer(TEST_USER, 'guild-nav-check', 'NavCheck', 'ch-nav');
  }

  const areaView = buildAreaDetailView(TEST_USER, 'area_star_outskirts');
  checkComponents('explore area detail', areaView.components as ActionRowBuilder<MessageActionRowComponentBuilder>[]);
  const exploreLabels = buttonLabels(areaView.components as ActionRowBuilder<MessageActionRowComponentBuilder>[]);
  assert(exploreLabels.includes('探索を開始する'), 'explore missing 探索を開始する');
  assert(exploreLabels.includes('ひとつ戻る'), 'explore missing ひとつ戻る');
  assert(exploreLabels.includes('街に戻る'), 'explore missing 街に戻る');

  const backExplore = buildNavBackPayload(TEST_USER, 'nav:back:explore:list');
  assert(!!backExplore, 'nav:back:explore:list failed');
  if (backExplore) {
    checkComponents('explore list back', backExplore.components as ActionRowBuilder<MessageActionRowComponentBuilder>[]);
  }

  addItem(TEST_USER, 'wpn_traveler_sword', 1);
  const inv = getDb().prepare(`
    SELECT id FROM player_inventory WHERE user_id = ? AND item_id = 'wpn_traveler_sword' LIMIT 1
  `).get(TEST_USER) as { id: number };
  getDb().prepare('UPDATE player_inventory SET upgrade_level = 1 WHERE id = ?').run(inv.id);

  for (const action of ['enhance', 'repair', 'awaken'] as const) {
    const payload = buildUpgradeConfirmPayload(TEST_USER, action, inv.id, 'blacksmith_starfield');
    checkComponents(`upgrade ${action} confirm`, payload.components as ActionRowBuilder<MessageActionRowComponentBuilder>[]);
    const labels = buttonLabels(payload.components as ActionRowBuilder<MessageActionRowComponentBuilder>[]);
    assert(labels.includes('ひとつ戻る'), `${action} confirm missing back`);
    assert(labels.includes('街に戻る'), `${action} confirm missing town`);
  }

  const nonePayload = buildEquipNoneConfirmPayload(TEST_USER, 'weapon', 'prep');
  checkComponents('equip none confirm', nonePayload.components as ActionRowBuilder<MessageActionRowComponentBuilder>[]);
  const noneLabels = buttonLabels(nonePayload.components as ActionRowBuilder<MessageActionRowComponentBuilder>[]);
  assert(noneLabels.includes('装備を外す'), 'equip none missing confirm');
  assert(noneLabels.includes('ひとつ戻る'), 'equip none missing back');

  const equipNav = buildEquipChangeConfirmRows(inv.id, 'weapon', 'slash');
  checkComponents('equip change confirm rows', equipNav);
  assert(buttonIds(equipNav).some((id) => id.startsWith('equip:confirm:')), 'equip confirm id missing');

  const prepBack = buildNavBackPayload(TEST_USER, 'nav:back:prep:weapon');
  if (prepBack) {
    checkComponents('prep equip back', prepBack.components as ActionRowBuilder<MessageActionRowComponentBuilder>[]);
    const opts = prepBack.components.flatMap((r) =>
      r.toJSON().components.filter((c) => c.type === 3).flatMap((c) => c.options ?? []),
    );
    if (opts.length >= 2) {
      const l0 = opts[0]!.label ?? '';
      const l1 = opts[1]!.label ?? '';
      if (l0.includes('星') && l1.includes('星') && l0 === l1) {
        assert(l0 !== l1 || opts[0]!.value !== opts[1]!.value, 'duplicate select values for same-name gear');
      }
    }
    const firstOpt = opts[0];
    if (firstOpt?.label && !firstOpt.label.includes('+') && opts.some((o) => (o.label ?? '').includes('+'))) {
      assert(firstOpt.label === '装備無し' || firstOpt.label.includes('+'), 'Phase2.2 label regression');
    }
  }

  const equipDone = nextActionButtons('equip_done', { slot: 'weapon' });
  checkComponents('equip_done nav', equipDone as ActionRowBuilder<MessageActionRowComponentBuilder>[]);

  if (issues.length) {
    console.error('❌ navigation-back-flow-check failed:');
    for (const i of issues) console.error('  -', i);
    process.exit(1);
  }
  console.log('✅ navigation-back-flow-check passed');
}

main();
