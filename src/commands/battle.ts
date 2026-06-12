import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { getPlayer } from '../systems/playerSystem';
import { getActiveBattle, getBattleDisplay, processBattleAction, buildBattleReply } from '../systems/battleSystem';
import { errorEmbed } from '../utils/embeds';
import { safeDefer, safeEdit } from '../utils/interaction';

export const data = new SlashCommandBuilder()
  .setName('battle')
  .setDescription('進行中の戦闘を表示・再開');

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await safeDefer(interaction);
  const userId = interaction.user.id;
  if (!getPlayer(userId)) { await safeEdit(interaction, { embeds: [errorEmbed('未登録です。')] }); return; }

  const battle = getActiveBattle(userId) as { id: string } | undefined;
  if (!battle) {
    await safeEdit(interaction, { embeds: [errorEmbed('進行中の戦闘はありません。/explore で探索してください。')] });
    return;
  }

  const reply = buildBattleReply(battle.id, userId);
  if (!reply) { await safeEdit(interaction, { embeds: [errorEmbed('戦闘データが見つかりません。')] }); return; }
  await safeEdit(interaction, reply);
}

export async function handleBattleAction(
  userId: string,
  sessionId: string,
  action: string,
  opts?: { skillId?: string; inventoryId?: number; targetInstanceId?: string },
) {
  return processBattleAction(userId, sessionId, action, opts);
}
