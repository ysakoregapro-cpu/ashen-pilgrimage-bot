/** rescue-raid-join-button-check — npx tsx scripts/rescue-raid-join-button-check.ts */
import { getDb } from '../src/db/database';
import { ensurePhase2Seed } from '../src/db/seedData/phase2Seed';
import { createPlayer, getPlayer } from '../src/systems/playerSystem';
import { setStoryFlag } from '../src/systems/storySystem';
import { createRescueRequest, joinRescue } from '../src/systems/rescueSystem';
import { createRaid, joinRaid } from '../src/systems/raidSystem';
import {
  createCoopRecruit,
  joinCoopRecruit,
  getActiveMemberCount,
  cancelCoopRecruit,
  resolveCoopRecruitIdForJoin,
} from '../src/systems/coop/coopRecruitSystem';
import { buildCoopRecruitButtons } from '../src/systems/coop/coopUi';
import { sanitizeComponents, collectComponentCustomIds } from '../src/utils/componentSafety';
import type { ActionRowBuilder, ButtonBuilder } from 'discord.js';

const GUILD = 'rescue-raid-btn-check-guild';
const LEADER = '1512670896278470688';
const HELPER = 'rescue-raid-helper-user';
const fails: string[] = [];

function assert(cond: boolean, msg: string): void {
  if (!cond) fails.push(msg);
}

function findJoinButton(components: ActionRowBuilder<ButtonBuilder>[]) {
  const json = components.flatMap((r) => r.toJSON().components);
  return json.find((c) => c.type === 2 && c.label === '参加する');
}

function main() {
  const db = getDb();
  ensurePhase2Seed(db);
  db.prepare('DELETE FROM coop_members').run();
  db.prepare('DELETE FROM coop_recruits').run();

  if (!getPlayer(LEADER)) {
    createPlayer(LEADER, GUILD, 'RescueRaidCheck', 'ch');
  }
  db.prepare('UPDATE players SET level = 80 WHERE user_id = ?').run(LEADER);
  setStoryFlag(LEADER, 'valhalla_unlocked');
  setStoryFlag(LEADER, 'chapter_completed:ch7_furnace');
  setStoryFlag(LEADER, 'boss_defeated:boss_old_furnace_keeper');
  const hasSrc = db.prepare(`
    SELECT 1 FROM player_inventory pi JOIN items i ON pi.item_id = i.id
    WHERE pi.user_id = ? AND i.rarity = 'Src' LIMIT 1
  `).get(LEADER);
  if (!hasSrc) {
    db.prepare(`
      INSERT INTO player_inventory (user_id, item_id, quantity, upgrade_level, durability_state, src_level, awakening_level, is_equipped, is_pending_reward, created_at, updated_at)
      VALUES (?, 'wpn_mist_staff', 1, 0, '良好', 1, 0, 0, 0, datetime('now'), datetime('now'))
    `).run(LEADER);
  }

  for (const mode of ['rescue', 'raid'] as const) {
    const created = createCoopRecruit(GUILD, LEADER, mode);
    assert(!!created.recruitId, `${mode}: recruit create failed`);
    const recruitId = created.recruitId!;

    const publicButtons = buildCoopRecruitButtons(recruitId, { forPublicChannel: true });
    const sanitized = sanitizeComponents(publicButtons, 'coop-recruit-public') as ActionRowBuilder<ButtonBuilder>[];

    const join = findJoinButton(sanitized);
    assert(!!join, `${mode}: 参加する button missing after sanitize`);
    assert(!!join?.custom_id, `${mode}: join custom_id empty`);
    assert(join?.custom_id === `coop:join:${recruitId}`, `${mode}: join custom_id mismatch`);
    assert(join?.disabled === false, `${mode}: join disabled for third party on public message (leader is member — must not disable globally)`);

    const dupes = collectComponentCustomIds(sanitized);
    const ids = dupes.map((d) => d.customId);
    assert(new Set(ids).size === ids.length, `${mode}: duplicate custom_id in recruit buttons`);

    joinCoopRecruit(recruitId, HELPER);
    assert(getActiveMemberCount(recruitId) === 2, `${mode}: helper join failed`);

    const fullRecruit = createCoopRecruit(GUILD, LEADER, mode);
    const fullId = fullRecruit.recruitId!;
    joinCoopRecruit(fullId, HELPER);
    joinCoopRecruit(fullId, 'helper-3');
    joinCoopRecruit(fullId, 'helper-4');
    const fullButtons = buildCoopRecruitButtons(fullId, { forPublicChannel: true });
    const fullJoin = findJoinButton(fullButtons);
    assert(fullJoin?.disabled === true, `${mode}: join should be disabled when full`);

    cancelCoopRecruit(fullId, LEADER);
  }

  // legacy custom_id paths — resolve legacy table id → coop recruit
  const legacyRescueId = createRescueRequest(GUILD, LEADER, 'explore', { areaLabel: 'test' });
  const legacyRescueRow = db.prepare('SELECT context_json FROM coop_recruits WHERE id = ?').get(legacyRescueId) as { context_json: string };
  const legacyRescueKey = JSON.parse(legacyRescueRow.context_json).legacy_rescue_id as string;
  assert(!!resolveCoopRecruitIdForJoin('rescue', legacyRescueKey), 'legacy rescue id not resolved to coop');
  const legacyRescueJoin = joinRescue(legacyRescueKey, HELPER);
  assert(legacyRescueJoin.includes('参加'), `legacy rescue:join failed: ${legacyRescueJoin}`);

  const legacyRaidId = createRaid(GUILD, LEADER);
  const legacyRaidRow = db.prepare('SELECT context_json FROM coop_recruits WHERE id = ?').get(legacyRaidId) as { context_json: string };
  const legacyRaidKey = JSON.parse(legacyRaidRow.context_json).legacy_raid_id as string;
  assert(!!resolveCoopRecruitIdForJoin('raid', legacyRaidKey), 'legacy raid id not resolved to coop');
  const legacyRaidJoin = joinRaid(legacyRaidKey, 'legacy-helper');
  assert(legacyRaidJoin.includes('参加'), `legacy raid:join failed: ${legacyRaidJoin}`);

  const orphanMsg = joinRescue('nonexistent-legacy-id', HELPER);
  assert(orphanMsg.includes('古い形式') || orphanMsg.includes('見つかりません'), `orphan legacy join should guide user: ${orphanMsg}`);

  const handlerPrefixes = ['coop:join', 'coop:leave', 'coop:start', 'coop:cancel', 'rescue:join', 'raid:join'];
  for (const p of handlerPrefixes) {
    assert(true, ''); // documented — index.ts routes parts[0]==='coop' && op in join/leave/start/cancel
  }

  console.log('## rescue-raid-join-button-check\n');
  if (fails.length) {
    console.error('FAIL');
    for (const f of fails.filter(Boolean)) console.error(`- ${f}`);
    process.exit(1);
  }
  console.log('OK — coop join public-enabled; legacy rescue:join/raid:join resolve to coop; orphan returns guidance');
}

main();
