import type { Client, TextChannel } from 'discord.js';
import { getDb } from '../../db/database';
import { getCoopRecruit } from './coopRecruitSystem';
import { getCoopBattle } from './coopBattleSystem';
import {
  buildCoopRecruitEmbed,
  buildCoopRecruitButtons,
  buildCoopBattleEmbed,
  buildCoopBattleButtons,
  buildCoopResultButtons,
} from './coopUi';
import type { CoopMode } from './coopTypes';

let clientRef: Client | null = null;

export function setCoopDiscordClient(client: Client): void {
  clientRef = client;
}

async function fetchTextChannel(channelId: string): Promise<TextChannel | null> {
  if (!clientRef) return null;
  try {
    const ch = await clientRef.channels.fetch(channelId);
    if (!ch?.isTextBased() || ch.isDMBased()) return null;
    return ch as TextChannel;
  } catch {
    return null;
  }
}

export async function safeEditMessage(
  channelId: string | null | undefined,
  messageId: string | null | undefined,
  payload: { embeds?: unknown[]; components?: unknown[] },
): Promise<boolean> {
  if (!channelId || !messageId || !clientRef) return false;
  const channel = await fetchTextChannel(channelId);
  if (!channel) return false;
  try {
    const msg = await channel.messages.fetch(messageId);
    await msg.edit(payload as Parameters<typeof msg.edit>[0]);
    return true;
  } catch {
    return false;
  }
}

export function setCoopBattleMessage(battleId: string, messageId: string, channelId: string): void {
  getDb().prepare('UPDATE coop_battle_sessions SET message_id = ?, channel_id = ? WHERE id = ?')
    .run(messageId, channelId, battleId);
}

export async function syncRecruitChannelMessage(recruitId: string, viewerId?: string): Promise<void> {
  const recruit = getCoopRecruit(recruitId);
  if (!recruit?.channel_id || !recruit.message_id) return;
  await safeEditMessage(recruit.channel_id, recruit.message_id, {
    embeds: [buildCoopRecruitEmbed(recruitId)],
    components: buildCoopRecruitButtons(recruitId, { forPublicChannel: true }),
  });
}

export async function syncBattleChannelMessage(battleId: string): Promise<void> {
  const battle = getCoopBattle(battleId);
  if (!battle) return;
  const recruit = getCoopRecruit(battle.recruit_id);
  const channelId = battle.channel_id ?? recruit?.channel_id;
  const messageId = battle.message_id ?? recruit?.message_id;
  if (!channelId || !messageId) return;

  const finished = ['victory', 'defeat', 'expired'].includes(battle.status);
  const leaderId = recruit?.leader_id ?? '';
  const embed = buildCoopBattleEmbed(battleId);
  const components = finished
    ? buildCoopResultButtons(battle.recruit_id, battle.mode as CoopMode, battle.status)
    : buildCoopBattleButtons(battleId, leaderId);

  await safeEditMessage(channelId, messageId, { embeds: [embed], components });
}

/** 募集メッセージを戦闘embedに差し替え */
export async function promoteRecruitMessageToBattle(recruitId: string, battleId: string): Promise<void> {
  const recruit = getCoopRecruit(recruitId);
  if (!recruit?.channel_id || !recruit.message_id) return;

  setCoopBattleMessage(battleId, recruit.message_id, recruit.channel_id);

  const ok = await safeEditMessage(recruit.channel_id, recruit.message_id, {
    embeds: [buildCoopBattleEmbed(battleId)],
    components: buildCoopBattleButtons(battleId, recruit.leader_id),
  });
  if (!ok) {
    const channel = await fetchTextChannel(recruit.channel_id);
    if (!channel) return;
    try {
      const msg = await channel.send({
        embeds: [buildCoopBattleEmbed(battleId)],
        components: buildCoopBattleButtons(battleId, recruit.leader_id),
      });
      setCoopBattleMessage(battleId, msg.id, recruit.channel_id);
    } catch { /* ignore */ }
  }
}

export async function syncRecruitOnExpire(recruitId: string): Promise<void> {
  const recruit = getCoopRecruit(recruitId);
  if (!recruit?.channel_id || !recruit.message_id) return;
  await safeEditMessage(recruit.channel_id, recruit.message_id, {
    embeds: [buildCoopRecruitEmbed(recruitId)],
    components: [],
  });
}
