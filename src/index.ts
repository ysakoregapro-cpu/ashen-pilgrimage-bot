import 'dotenv/config';

import {

  Client,

  GatewayIntentBits,

  Events,

  ActionRowBuilder,

  ButtonBuilder,

  ButtonStyle,

  type Interaction,

  type ButtonInteraction,

  type StringSelectMenuInteraction,
} from 'discord.js';

import { getDb } from './db/database';

import { loadCommands } from './commands/index';

import { getEnv } from './utils/permissions';

import { errorEmbed, successEmbed } from './utils/embeds';
import { nextActionButtons, errorRecoveryPayload } from './utils/nextActionButtons';
import type { UiPayload } from './utils/townUi';
import { townHubEmbed } from './utils/townUi';
import { selectMenu } from './utils/embeds';

import { handleJobSelect } from './commands/job';

import { handleEquip } from './commands/equip';

import { handleExploreSelect } from './commands/explore';
import { handleBattleAction } from './commands/battle';
import {
  buildBattleReply, buildSkillMenuReply, buildItemMenuReply, processBattleAction,
} from './systems/battleSystem';
import { parseBattleCustomId } from './utils/battleCustomId';

import { handleTradeAdd } from './commands/trade';

import { handleUpgradeAction } from './commands/upgrade';

import { joinRescue, startPreemptiveRescue } from './commands/rescue';

import { joinRaid, startRaid, leaveRaid } from './commands/raid';

import {

  handleUxButton,

  handleUxSelect,

  buildPostVictory,

  buildPostDefeat,

  buildPostExplore,
  buildPostFled,
  buildSkillLearnedPost,
} from './interactions/uxHandler';

import {
  parseSessionCustomId,
  isPanelSessionValid,
  respondStale,
  sendJourneyLogAfterSelect,
  disableOldComponents,
  getSendableChannel,
  stampPanelPayload,
} from './utils/messageFlow';
import {
  triggerFirstVictory,
  triggerFirstDefeat,
  triggerBossDefeated,
  triggerFirstJobLevelUp,
  triggerTownFirstArrival,
  type StoryEventPayload,
} from './systems/storySystem';



const client = new Client({ intents: [GatewayIntentBits.Guilds] });



client.once(Events.ClientReady, (c) => {

  getDb();

  console.log(`灰星巡礼録 起動完了: ${c.user.tag}`);

});



client.on(Events.InteractionCreate, async (interaction: Interaction) => {

  try {

    if (interaction.isChatInputCommand()) {

      const commands = loadCommands();

      const cmd = commands.get(interaction.commandName);

      if (!cmd) return;

      await cmd.execute(interaction);

      return;

    }



    if (interaction.isStringSelectMenu()) {

      const handled = await handleUxSelect(interaction);

      if (handled) return;

      await handleSelect(interaction);

      return;

    }



    if (interaction.isButton()) {

      const handled = await handleUxButton(interaction);

      if (handled) return;

      await handleButton(interaction);

    }

  } catch (e) {

    console.error('Interaction error:', e);

    const recovery = errorRecoveryPayload('道しるべが乱れたようです。\n少し戻って、もう一度選び直してください。');

    if (interaction.isRepliable()) {

      const channel = getSendableChannel(interaction.channel);

      if (interaction.replied || interaction.deferred) {

        if (channel) await channel.send(recovery).catch(() => {});

        else await interaction.followUp({ ...recovery, ephemeral: true }).catch(() => {});

      } else {

        await interaction.reply(recovery).catch(() => {});

      }

    }

  }

});



function stripSelectId(customId: string): string {

  return parseSessionCustomId(customId).base;

}



async function sendSelectResultLog(
  interaction: StringSelectMenuInteraction,
  payload: UiPayload,
): Promise<void> {

  await disableOldComponents(interaction.message);

  const channel = getSendableChannel(interaction.channel);
  if (!channel) return;
  await interaction.deferUpdate();
  await channel.send(payload);

}



async function handleSelect(interaction: StringSelectMenuInteraction): Promise<void> {

  const base = stripSelectId(interaction.customId);

  const [prefix, action, extra] = base.split(':');

  const userId = interaction.user.id;

  const value = interaction.values[0]!;

  const { session } = parseSessionCustomId(interaction.customId);



  if (prefix === 'town' && action === 'travel') {

    if (session && !isPanelSessionValid(userId, session)) {

      await respondStale(interaction);

      return;

    }

    const { travelToTownWithResult, buildTownHub } = await import('./systems/townActionSystem');

    const travel = travelToTownWithResult(userId, value);
    if (!travel.ok) {
      await sendJourneyLogAfterSelect(interaction, {
        embeds: [(await import('./utils/townUi')).townHubEmbed('道', travel.message)],
        components: (await import('./utils/townUi')).townHubButtons(),
      });
      return;
    }

    await disableOldComponents(interaction.message);
    const channel = getSendableChannel(interaction.channel);
    if (!channel) return;
    await interaction.deferUpdate();

    const storyEvents = triggerTownFirstArrival(userId, value);
    await sendStoryPayloads(channel, storyEvents);
    await channel.send(stampPanelPayload(userId, buildTownHub(userId, {
      isFirstVisit: travel.isFirstVisit,
      intro: `${travel.message}\n`,
      skipLootConfirm: true,
    })));

    return;

  }



  if (prefix === 'onboarding' && action === 'job') {

    if (session && !isPanelSessionValid(userId, session)) {

      await respondStale(interaction);

      return;

    }

    const isSub = extra === 'sub';

    const msg = await handleJobSelect(userId, value, isSub);

    await sendSelectResultLog(interaction, {

      embeds: [successEmbed(msg)],

      components: nextActionButtons('job_done'),

    });

    return;

  }



  if (prefix === 'equip') {

    const invId = Number(value);
    const { buildEquipmentDetailView } = await import('./systems/itemDetailSystem');
    const payload = buildEquipmentDetailView(userId, invId, { compare: true, context: 'equip' });
    payload.components.unshift(new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`equip:confirm:${invId}`).setLabel('装備する').setStyle(ButtonStyle.Success),
    ));
    await sendSelectResultLog(interaction, payload);
    return;

  }



  if (prefix === 'explore' && action === 'select') {

    if (session && !isPanelSessionValid(userId, session)) {

      await respondStale(interaction);

      return;

    }

    const { buildAreaDetailView } = await import('./systems/townActionSystem');

    await sendJourneyLogAfterSelect(interaction, buildAreaDetailView(userId, value));

    return;

  }



  if (prefix === 'trade' && action === 'add' && extra) {

    const msg = handleTradeAdd(userId, extra, Number(value));

    await sendSelectResultLog(interaction, { embeds: [successEmbed(msg)], components: nextActionButtons('generic') });

    return;

  }



  if (prefix === 'battle') {

    const battle = parseBattleCustomId(base);

    if (!battle) {

      await interaction.update({ embeds: [errorEmbed('不明な選択です。')], components: [] });

      return;

    }

    if (battle.action === 'skill_pick') {

      const result = await processBattleAction(userId, battle.sessionId, 'skill', { skillId: value });

      await handleBattleResult(interaction, battle.sessionId, result);

      return;

    }

    if (battle.action === 'item_pick') {

      const result = await processBattleAction(userId, battle.sessionId, 'item', { inventoryId: Number(value) });

      await handleBattleResult(interaction, battle.sessionId, result);

      return;

    }

  }



  if (prefix === 'upgrade') {

    if (session && !isPanelSessionValid(userId, session)) {

      await respondStale(interaction);

      return;

    }

    if (action === 'dismantle') {
      const invId = Number(value);
      const { buildItemDetailView, getActionWarnings, canDismantleItem } = await import('./systems/itemDetailSystem');
      const dis = canDismantleItem(userId, invId);
      const warnings = [
        ...getActionWarnings(userId, invId, 'dismantle'),
        ...(dis.reason ? [dis.reason] : []),
        ...(dis.warning ? [dis.warning] : []),
      ];
      const payload = buildItemDetailView(userId, { inventoryId: invId, context: 'upgrade', warnings });
      payload.components.unshift(new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(`upgrade:confirm_dismantle:${invId}`).setLabel('分解する').setStyle(ButtonStyle.Danger).setDisabled(!dis.ok),
      ));
      await sendSelectResultLog(interaction, payload);
      return;
    }

    const result = handleUpgradeAction(userId, action!, Number(value));

    await sendSelectResultLog(interaction, { ...result, components: nextActionButtons('upgrade') });

    return;

  }

  if (prefix === 'shop' && action === 'sell') {
    const invId = Number(value);
    const { buildItemDetailView, getActionWarnings, canSellItem } = await import('./systems/itemDetailSystem');
    const sell = canSellItem(userId, invId);
    const warnings = [
      ...getActionWarnings(userId, invId, 'sell'),
      ...(sell.reason ? [sell.reason] : []),
      ...(sell.warning ? [sell.warning] : []),
    ];
    const payload = buildItemDetailView(userId, { inventoryId: invId, context: 'shop_sell', warnings });
    payload.components.unshift(new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`shop:confirm_sell:${invId}`).setLabel('売却する').setStyle(ButtonStyle.Danger).setDisabled(!sell.ok),
    ));
    await sendSelectResultLog(interaction, payload);
    return;
  }

  if (prefix === 'shop' && action === 'buy') {
    const { buyShopItem } = await import('./systems/shopSystem');
    const { getCurrentTown } = await import('./systems/townSystem');
    const town = getCurrentTown(userId) as { id: string } | undefined;
    const r = buyShopItem(userId, value, town?.id ?? 'start_starfield');
    await sendSelectResultLog(interaction, { embeds: [successEmbed(r.message)], components: nextActionButtons('facility') });
    return;
  }

  if (prefix === 'detail') {
    if (action === 'inv') {
      const invId = Number(value);
      const { buildItemDetailView, getActionWarnings } = await import('./systems/itemDetailSystem');
      await sendSelectResultLog(interaction, buildItemDetailView(userId, {
        inventoryId: invId,
        context: 'inventory',
        warnings: getActionWarnings(userId, invId, 'sell'),
      }));
      return;
    }
    if (action === 'skill') {
      const { buildSkillDetailView } = await import('./systems/itemDetailSystem');
      await sendSelectResultLog(interaction, buildSkillDetailView(userId, value));
      return;
    }
    if (action === 'shop') {
      const { buildItemDetailView } = await import('./systems/itemDetailSystem');
      const { getCurrentTown } = await import('./systems/townSystem');
      const { getShopCatalog } = await import('./systems/shopSystem');
      const town = getCurrentTown(userId) as { id: string } | undefined;
      const catalog = getShopCatalog(town?.id ?? 'start_starfield');
      const item = catalog.find((c) => c.item_id === value);
      await sendSelectResultLog(interaction, buildItemDetailView(userId, {
        itemId: value,
        context: 'shop_buy',
        shopBuyPrice: item?.buy_price,
      }));
      return;
    }
    if (action === 'listing') {
      const { buildListingDetailView } = await import('./systems/itemDetailSystem');
      await sendSelectResultLog(interaction, buildListingDetailView(userId, value));
      return;
    }
  }

  if (prefix === 'market' && action === 'buy') {
    const { buildListingDetailView } = await import('./systems/itemDetailSystem');
    await sendSelectResultLog(interaction, buildListingDetailView(userId, value));
    return;
  }

  if (prefix === 'market' && action === 'list') {
    const invId = Number(value);
    const { buildItemDetailView, getActionWarnings, canListItem } = await import('./systems/itemDetailSystem');
    const { getMarketPriceHint } = await import('./systems/itemValueSystem');
    const row = getDb().prepare('SELECT item_id FROM player_inventory WHERE id = ? AND user_id = ?').get(invId, userId) as { item_id: string } | undefined;
    const hint = getMarketPriceHint(row?.item_id ?? '');
    const list = canListItem(userId, invId);
    const warnings = [
      ...getActionWarnings(userId, invId, 'sell'),
      ...(list.reason ? [list.reason] : []),
      ...(list.warning ? [list.warning] : []),
      `目安価格: ${hint.min}〜${Math.round(hint.base * 1.5)}G`,
    ];
    const payload = buildItemDetailView(userId, { inventoryId: invId, context: 'market', warnings });
    payload.components.unshift(new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`market:confirm_list:${invId}`).setLabel(`出品する（${hint.base}G）`).setStyle(ButtonStyle.Primary).setDisabled(!list.ok),
    ));
    await sendSelectResultLog(interaction, payload);
    return;
  }

  if (prefix === 'market' && action === 'cancel') {
    const { cancelListing } = await import('./systems/marketSystem');
    const r = cancelListing(userId, value);
    await sendSelectResultLog(interaction, { embeds: [successEmbed(r.message)], components: nextActionButtons('facility') });
    return;
  }

  if (prefix === 'prep' && action === 'slot') {
    const { getPrepSlotOptions } = await import('./systems/prepSystem');
    const opts = getPrepSlotOptions(userId, value as import('./types').EquipmentSlot);
    const pickOpts = opts.filter((o) => !o.disabled).slice(0, 25);
    await sendSelectResultLog(interaction, {
      embeds: [townHubEmbed('装備変更', `**${value}** の装備候補`)],
      components: pickOpts.length ? [
        selectMenu('prep:equip', '装備を選ぶ', pickOpts.map((o) => ({
          label: o.label, value: String(o.inventoryId), description: o.description,
        }))),
        selectMenu('detail:inv', '詳細を見る', pickOpts.map((o) => ({
          label: o.label, value: String(o.inventoryId), description: o.description,
        }))),
      ] : nextActionButtons('equip'),
    });
    return;
  }

  if (prefix === 'prep' && action === 'equip') {
    const invId = Number(value);
    const { buildEquipmentDetailView } = await import('./systems/itemDetailSystem');
    const payload = buildEquipmentDetailView(userId, invId, { compare: true, context: 'equip' });
    payload.components.unshift(new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`prep:confirm_equip:${invId}`).setLabel('この装備に変更').setStyle(ButtonStyle.Success),
    ));
    await sendSelectResultLog(interaction, payload);
    return;
  }

  if (prefix === 'prep' && action === 'confirm') {
    return;
  }

  await interaction.update({ embeds: [errorEmbed('不明な選択です。')], components: [] });

}



async function sendStoryPayloads(
  channel: NonNullable<ReturnType<typeof getSendableChannel>>,
  payloads: StoryEventPayload[],
): Promise<void> {
  for (const p of payloads) {
    await channel.send({ embeds: p.embeds, components: p.components });
  }
}

async function handleBattleResult(
  interaction: ButtonInteraction | StringSelectMenuInteraction,
  sessionId: string,
  result: Awaited<ReturnType<typeof processBattleAction>>,
): Promise<void> {

  if (result.done) {

    await disableOldComponents(interaction.message);

    const channel = getSendableChannel(interaction.channel);
    if (!channel) return;
    await interaction.deferUpdate();

    if (result.status === 'victory') {

      await channel.send(buildPostVictory(result.message));

      const session = getDb().prepare('SELECT monster_id FROM battle_sessions WHERE id = ?').get(sessionId) as { monster_id: string } | undefined;
      const storyEvents: StoryEventPayload[] = [
        ...triggerFirstVictory(interaction.user.id),
        ...(session ? triggerBossDefeated(interaction.user.id, session.monster_id) : []),
      ];
      if (result.jobLeveledUp?.length) {
        for (const jobName of result.jobLeveledUp) {
          storyEvents.push(...triggerFirstJobLevelUp(interaction.user.id, jobName));
        }
      } else if (result.skillLearned?.length) {
        for (const sl of result.skillLearned) {
          storyEvents.push(...triggerFirstJobLevelUp(interaction.user.id, sl.jobName));
        }
      }
      await sendStoryPayloads(channel, storyEvents);

      if (result.skillLearned?.length) {

        const { buildSkillLearnedPost } = await import('./systems/townActionSystem');

        for (const sl of result.skillLearned) {

          await channel.send(buildSkillLearnedPost(sl.jobName, sl.skills));

        }

      }

      return;

    }

    if (result.status === 'defeat') {

      await channel.send(buildPostDefeat(result.message));
      await sendStoryPayloads(channel, triggerFirstDefeat(interaction.user.id));

      return;

    }

    if (result.status === 'fled') {

      await channel.send(buildPostFled(result.message));

      return;

    }

    await channel.send(buildPostExplore(result.message));

    return;

  }

  const reply = buildBattleReply(sessionId, interaction.user.id);

  if (!reply) return;

  if (result.notify === 'mp' || result.notify === 'blocked') {

    reply.embeds[0]?.setDescription(result.message);

  }

  if (interaction.isButton() || interaction.isStringSelectMenu()) {

    await interaction.update(reply);

  }

}



async function handleButton(interaction: ButtonInteraction): Promise<void> {

  const parts = interaction.customId.split(':');

  const userId = interaction.user.id;



  if (parts[0] === 'battle') {

    const sessionId = parts[1]!;

    const action = parts[2]!;

    if (action === 'rescue') {

      await interaction.reply({

        embeds: [successEmbed('救難の便りは「救難を求める」から出せます。\n/rescue request でも同じです。')],

        ephemeral: true,

      });

      return;

    }

    if (action === 'skill_menu') {

      const reply = buildSkillMenuReply(sessionId, userId);

      if (!reply) {

        await interaction.reply({ embeds: [errorEmbed('使える技がない。')], ephemeral: true });

        return;

      }

      await interaction.update(reply);

      return;

    }



    if (action === 'item_menu') {

      const reply = buildItemMenuReply(sessionId, userId);

      if (!reply) {

        await interaction.reply({ embeds: [errorEmbed('戦闘で使える品がない。')], ephemeral: true });

        return;

      }

      await interaction.update(reply);

      return;

    }



    const result = await handleBattleAction(userId, sessionId, action);

    await handleBattleResult(interaction, sessionId, result);

    return;

  }



  if (parts[0] === 'rescue') {

    const rescueId = parts[2]!;

    if (parts[1] === 'join') {

      const msg = joinRescue(rescueId, userId);

      await interaction.reply({ embeds: [successEmbed(msg)] });

      return;

    }

    if (parts[1] === 'depart') {

      const { startRescueBattle } = await import('./systems/rescueBattleSystem');
      const battle = startRescueBattle(rescueId);
      await interaction.reply({ embeds: [successEmbed(battle.message)] });

      return;

    }

    if (parts[1] === 'act') {
      const battleId = parts[2]!;
      const act = parts[3]!;
      const { setRescueAction } = await import('./systems/rescueBattleSystem');
      const msg = setRescueAction(battleId, userId, act);
      await interaction.reply({ embeds: [successEmbed(msg)], ephemeral: true });
      return;
    }

    return;

  }



  if (parts[0] === 'raid') {

    const raidId = parts[2]!;

    if (parts[1] === 'join') {

      const msg = joinRaid(raidId, userId);

      await interaction.reply({ embeds: [successEmbed(msg)] });

      return;

    }

    if (parts[1] === 'depart') {

      const result = startRaid(raidId, userId);

      const { formatRaidBattleStatus } = await import('./systems/raidBattleSystem');
      const body = result.battleId ? formatRaidBattleStatus(result.battleId) : result.message;
      const components = result.battleId ? [
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder().setCustomId(`raid:act:${result.battleId}:attack`).setLabel('攻撃').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId(`raid:act:${result.battleId}:defend`).setLabel('防御').setStyle(ButtonStyle.Secondary),
        ),
      ] : [];
      await interaction.reply({
        embeds: [successEmbed(`${result.message}\n\n${body}`)],
        components,
      });

      return;

    }

    if (parts[1] === 'act') {
      const battleId = parts[2]!;
      const act = parts[3]!;
      const { setRaidAction } = await import('./systems/raidBattleSystem');
      const msg = setRaidAction(battleId, userId, act);
      await interaction.reply({ embeds: [successEmbed(msg)], ephemeral: true });
      return;
    }

    if (parts[1] === 'leave') {

      const msg = leaveRaid(raidId, userId);

      await interaction.reply({ embeds: [successEmbed(msg)] });

    }

    return;

  }



  if (parts[0] === 'equip' && parts[1] === 'confirm') {
    const invId = Number(parts[2]);
    const { assertInventoryOwned } = await import('./systems/itemDetailSystem');
    const owned = assertInventoryOwned(userId, invId);
    await disableOldComponents(interaction.message);
    const channel = getSendableChannel(interaction.channel);
    if (!channel) return;
    await interaction.deferUpdate();
    if (!owned.ok) {
      await channel.send({ embeds: [errorEmbed(owned.reason ?? '装備できません。')], components: nextActionButtons('equip') });
      return;
    }
    const msg = handleEquip(userId, invId);
    await channel.send({ embeds: [successEmbed(msg)], components: nextActionButtons('equip') });
    return;
  }

  if (parts[0] === 'detail') {
    if (parts[1] === 'open') {
      const { buildInventoryDetailPickView, buildSkillDetailPickView, buildShopDetailPickView } = await import('./systems/itemDetailSystem');
      const { getCurrentTown } = await import('./systems/townSystem');
      const ctx = parts[2] ?? 'inventory';
      let payload: UiPayload;
      if (ctx === 'skill') payload = buildSkillDetailPickView(userId);
      else if (ctx === 'shop_buy' || ctx === 'shop_sell') {
        const town = getCurrentTown(userId) as { id: string } | undefined;
        payload = buildShopDetailPickView(userId, town?.id ?? 'start_starfield', ctx === 'shop_buy' ? 'buy' : 'sell');
      } else payload = buildInventoryDetailPickView(userId);
      await disableOldComponents(interaction.message);
      const channel = getSendableChannel(interaction.channel);
      if (!channel) return;
      await interaction.deferUpdate();
      await channel.send(payload);
      return;
    }
    if (parts[1] === 'compare') {
      const invId = Number(parts[2]);
      const { buildEquipmentDetailView, assertInventoryOwned } = await import('./systems/itemDetailSystem');
      await disableOldComponents(interaction.message);
      const channel = getSendableChannel(interaction.channel);
      if (!channel) return;
      await interaction.deferUpdate();
      const owned = assertInventoryOwned(userId, invId);
      if (!owned.ok) {
        await channel.send({ embeds: [errorEmbed(owned.reason ?? '品が見つかりません。')], components: nextActionButtons('equip') });
        return;
      }
      await channel.send(buildEquipmentDetailView(userId, invId, { compare: true, context: 'equip' }));
      return;
    }
  }

  if (parts[0] === 'shop' && parts[1] === 'confirm_sell') {
    const invId = Number(parts[2]);
    const { canSellItem, assertInventoryOwned } = await import('./systems/itemDetailSystem');
    const owned = assertInventoryOwned(userId, invId);
    const sell = canSellItem(userId, invId);
    await disableOldComponents(interaction.message);
    const channel = getSendableChannel(interaction.channel);
    if (!channel) return;
    await interaction.deferUpdate();
    if (!owned.ok || !sell.ok) {
      await channel.send({ embeds: [errorEmbed(sell.reason ?? owned.reason ?? '売却できません。')], components: nextActionButtons('facility') });
      return;
    }
    const { sellInventoryItem } = await import('./systems/shopSystem');
    const r = sellInventoryItem(userId, invId);
    await channel.send({ embeds: [successEmbed(r.message)], components: nextActionButtons('facility') });
    return;
  }

  if (parts[0] === 'market' && parts[1] === 'confirm_buy') {
    const listingId = parts[2]!;
    const { assertListingActive } = await import('./systems/itemDetailSystem');
    const listing = assertListingActive(listingId);
    await disableOldComponents(interaction.message);
    const channel = getSendableChannel(interaction.channel);
    if (!channel) return;
    await interaction.deferUpdate();
    if (!listing.ok) {
      await channel.send({ embeds: [errorEmbed(listing.reason ?? '購入できません。')], components: nextActionButtons('facility') });
      return;
    }
    const { buyListing } = await import('./systems/marketSystem');
    const r = buyListing(userId, listingId);
    await channel.send({ embeds: [successEmbed(r.message)], components: nextActionButtons('facility') });
    return;
  }

  if (parts[0] === 'market' && parts[1] === 'confirm_list') {
    const invId = Number(parts[2]);
    const { canListItem, assertInventoryOwned } = await import('./systems/itemDetailSystem');
    const owned = assertInventoryOwned(userId, invId);
    const list = canListItem(userId, invId);
    await disableOldComponents(interaction.message);
    const channel = getSendableChannel(interaction.channel);
    if (!channel) return;
    await interaction.deferUpdate();
    if (!owned.ok || !list.ok) {
      await channel.send({ embeds: [errorEmbed(list.reason ?? owned.reason ?? '出品できません。')], components: nextActionButtons('facility') });
      return;
    }
    const { createListing } = await import('./systems/marketSystem');
    const { getMarketPriceHint } = await import('./systems/itemValueSystem');
    const row = getDb().prepare('SELECT item_id FROM player_inventory WHERE id = ? AND user_id = ?').get(invId, userId) as { item_id: string } | undefined;
    const hint = getMarketPriceHint(row?.item_id ?? '');
    const r = createListing(userId, invId, hint.base);
    await channel.send({ embeds: [successEmbed(r.message)], components: nextActionButtons('facility') });
    return;
  }

  if (parts[0] === 'upgrade' && parts[1] === 'confirm_dismantle') {
    const invId = Number(parts[2]);
    const { canDismantleItem, assertInventoryOwned } = await import('./systems/itemDetailSystem');
    const owned = assertInventoryOwned(userId, invId);
    const dis = canDismantleItem(userId, invId);
    await disableOldComponents(interaction.message);
    const channel = getSendableChannel(interaction.channel);
    if (!channel) return;
    await interaction.deferUpdate();
    if (!owned.ok || !dis.ok) {
      await channel.send({ embeds: [errorEmbed(dis.reason ?? owned.reason ?? '分解できません。')], components: nextActionButtons('upgrade') });
      return;
    }
    const result = handleUpgradeAction(userId, 'dismantle', invId);
    await channel.send({ ...result, components: nextActionButtons('upgrade') });
    return;
  }

  if (parts[0] === 'prep' && parts[1] === 'confirm_equip') {
    const invId = Number(parts[2]);
    const { assertInventoryOwned } = await import('./systems/itemDetailSystem');
    const owned = assertInventoryOwned(userId, invId);
    await disableOldComponents(interaction.message);
    const channel = getSendableChannel(interaction.channel);
    if (!channel) return;
    await interaction.deferUpdate();
    if (!owned.ok) {
      await channel.send({ embeds: [errorEmbed(owned.reason ?? '装備できません。')], components: nextActionButtons('equip') });
      return;
    }
    const { equipWithDiff } = await import('./systems/prepSystem');
    const r = equipWithDiff(userId, invId);
    await channel.send({ embeds: [successEmbed(r.message)], components: nextActionButtons('equip') });
    return;
  }

  await interaction.reply({ embeds: [errorEmbed('不明な操作です。')], ephemeral: true });

}



client.login(getEnv('DISCORD_TOKEN')).catch((e) => {

  console.error('Login failed:', e);

  process.exit(1);

});

