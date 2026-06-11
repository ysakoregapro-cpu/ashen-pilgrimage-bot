import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, type ChatInputCommandInteraction } from 'discord.js';
import { getPlayer } from '../systems/playerSystem';
import { createTrade, getActiveTradeForUser, addTradeItem, confirmTrade, cancelTrade, getTrade } from '../systems/tradeSystem';
import { baseEmbed, errorEmbed, successEmbed, selectMenu } from '../utils/embeds';
import { safeDefer, safeEdit } from '../utils/interaction';
import { getInventory } from '../systems/inventorySystem';

export const data = new SlashCommandBuilder()
  .setName('trade')
  .setDescription('プレイヤー間取引')
  .addSubcommand((s) => s.setName('start').setDescription('取引開始').addUserOption((o) => o.setName('user').setDescription('相手').setRequired(true)))
  .addSubcommand((s) => s.setName('add').setDescription('アイテム追加'))
  .addSubcommand((s) => s.setName('confirm').setDescription('取引確認'))
  .addSubcommand((s) => s.setName('cancel').setDescription('取引キャンセル'))
  .addSubcommand((s) => s.setName('status').setDescription('取引状況'));

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await safeDefer(interaction);
  const userId = interaction.user.id;
  const guild = interaction.guild;
  if (!getPlayer(userId)) { await safeEdit(interaction, { embeds: [errorEmbed('未登録です。')] }); return; }
  if (!guild) { await safeEdit(interaction, { embeds: [errorEmbed('サーバー内でのみ使用できます。')] }); return; }

  const sub = interaction.options.getSubcommand();

  if (sub === 'start') {
    const partner = interaction.options.getUser('user', true);
    if (!getPlayer(partner.id)) { await safeEdit(interaction, { embeds: [errorEmbed('相手が未登録です。')] }); return; }
    const tradeId = createTrade(guild.id, userId, partner.id);
    await safeEdit(interaction, {
      embeds: [successEmbed(`<@${partner.id}> との取引を開始しました。\n取引ID: \`${tradeId}\`\n/trade add でアイテムを追加し、双方 /trade confirm で成立。`)],
    });
    return;
  }

  const trade = getActiveTradeForUser(userId) as { id: string; initiator_id: string; partner_id: string; initiator_items_json: string; partner_items_json: string; initiator_confirmed: number; partner_confirmed: number } | undefined;
  if (!trade && sub !== 'status') {
    await safeEdit(interaction, { embeds: [errorEmbed('進行中の取引がありません。/trade start で開始してください。')] });
    return;
  }

  if (sub === 'add') {
    const inv = getInventory(userId).filter((i) => {
      const row = i as { is_equipped: number; tradeable: number; category: string; rarity: string };
      return !row.is_equipped && row.tradeable && !(row.category === 'equipment' && row.rarity === 'Src');
    }) as Array<{ id: number; name: string; rarity: string }>;
    if (!inv.length) { await safeEdit(interaction, { embeds: [errorEmbed('取引可能なアイテムがありません。')] }); return; }
    await safeEdit(interaction, {
      embeds: [baseEmbed('取引に追加', 'アイテムを選択')],
      components: [selectMenu(`trade:add:${trade!.id}`, 'アイテム選択', inv.slice(0, 25).map((i) => ({ label: i.name, value: String(i.id), description: i.rarity })))],
    });
    return;
  }

  if (sub === 'confirm') {
    const msg = confirmTrade(trade!.id, userId);
    await safeEdit(interaction, { embeds: [msg.includes('成立') ? successEmbed(msg) : baseEmbed('取引', msg)] });
    return;
  }

  if (sub === 'cancel') {
    const msg = cancelTrade(trade!.id, userId);
    await safeEdit(interaction, { embeds: [baseEmbed('取引', msg)] });
    return;
  }

  if (sub === 'status' && trade) {
    const initItems = JSON.parse(trade.initiator_items_json) as Array<{ name: string; quantity: number }>;
    const partItems = JSON.parse(trade.partner_items_json) as Array<{ name: string; quantity: number }>;
    await safeEdit(interaction, {
      embeds: [baseEmbed('取引状況',
        `**<@${trade.initiator_id}>**\n${initItems.map((i) => i.name).join(', ') || '—'} ${trade.initiator_confirmed ? '✅' : '⏳'}\n` +
        `**<@${trade.partner_id}>**\n${partItems.map((i) => i.name).join(', ') || '—'} ${trade.partner_confirmed ? '✅' : '⏳'}`,
      )],
    });
  } else {
    await safeEdit(interaction, { embeds: [baseEmbed('取引', '進行中の取引はありません。')] });
  }
}

export function handleTradeAdd(userId: string, tradeId: string, inventoryId: number): string {
  return addTradeItem(tradeId, userId, inventoryId);
}
