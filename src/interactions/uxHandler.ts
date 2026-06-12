import type { ButtonInteraction, StringSelectMenuInteraction } from 'discord.js';
import {
  buildTownHub,
  buildFacilityList,
  buildNpcList,
  buildExploreList,
  buildTravelList,
  buildFacilityView,
  buildNpcView,
  buildNpcDialogue,
  buildGuideHome,
  buildGuideView,
} from '../systems/townActionSystem';
import {
  executeFacilityAction,
  getUpgradeSelectOptions,
  getSrcUniqueOptions,
  getJobSelectOptions,
  formatEquipSummary,
  getFacility,
} from '../systems/facilitySystem';
import { getPlayer, recalculatePlayerStats } from '../systems/playerSystem';
import { selectMenu, errorEmbed, successEmbed } from '../utils/embeds';
import {
  playerRecordEmbed,
  equipSummaryEmbed,
  townHubEmbed,
  parseFacilityActionId,
  type UiPayload,
} from '../utils/townUi';
import { nextActionButtons, type UpgradeActionKind } from '../utils/nextActionButtons';
import { detailOpenButton } from '../systems/itemDetailSystem';
import {
  parseSessionCustomId,
  isPanelSessionValid,
  respondStale,
  updateActionPanel,
  sendJourneyLog,
  sendJourneyLogAfterSelect,
  disableOldComponents,
  stampPanelPayload,
  getSendableChannel,
  replyEphemeralNoChannel,
} from '../utils/messageFlow';
import { buildInventoryView, type InventoryCategory } from '../utils/inventoryUi';

export { buildPostExplore, buildPostVictory, buildPostDefeat, buildPostFled, buildSkillLearnedPost, arriveAndShowHub, buildTownHub, buildGuideHome } from '../systems/townActionSystem';

async function runExploreAction(interaction: ButtonInteraction, userId: string, areaId: string): Promise<void> {
  const { handleExploreSelect } = await import('../commands/explore');
  const { buildPostExplore } = await import('../systems/townActionSystem');
  const { buildBattleReply } = await import('../systems/battleSystem');
  const result = await handleExploreSelect(userId, areaId);
  if (result.type === 'battle' && result.battleId) {
    const reply = buildBattleReply(result.battleId, userId);
    if (reply) {
      await sendJourneyLog(interaction, reply);
      return;
    }
  }
  await sendJourneyLog(interaction, buildPostExplore(result.message, areaId));
}

async function handlePrepBack(interaction: ButtonInteraction, userId: string, base: string): Promise<void> {
  const { PREP_SLOTS, getPrepSlotOptions, formatCurrentEquipment } = await import('../systems/prepSystem');
  const { townHubEmbed } = await import('../utils/townUi');
  const { selectMenu } = await import('../utils/embeds');
  const slotLabels: Record<string, string> = {
    weapon: '武器', head: '頭', body: '胴', arms: '腕', legs: '脚', feet: '靴',
    accessory1: 'アクセ1', accessory2: 'アクセ2', sub: '補助',
  };

  if (base === 'prep:back:slots') {
    await sendJourneyLog(interaction, {
      embeds: [townHubEmbed('身支度', formatCurrentEquipment(userId))],
      components: [
        selectMenu('prep:slot', '部位を選ぶ', PREP_SLOTS.map((s) => ({
          label: slotLabels[s] ?? s,
          value: s,
        }))),
        detailOpenButton('equip'),
        ...nextActionButtons('equip'),
      ],
    });
    return;
  }

  if (base.startsWith('prep:back:slot:')) {
    const slot = base.slice('prep:back:slot:'.length);
    const opts = getPrepSlotOptions(userId, slot as import('../types').EquipmentSlot);
    const pickOpts = opts.filter((o) => !o.disabled).slice(0, 25);
    await sendJourneyLog(interaction, {
      embeds: [townHubEmbed('装備変更', `**${slotLabels[slot] ?? slot}** の装備候補`)],
      components: pickOpts.length ? [
        selectMenu('prep:equip', '装備を選ぶ', pickOpts.map((o) => ({
          label: o.label, value: String(o.inventoryId), description: o.description,
        }))),
        selectMenu('detail:inv', '詳細を見る', pickOpts.map((o) => ({
          label: o.label, value: String(o.inventoryId), description: o.description,
        }))),
        ...nextActionButtons('equip'),
      ] : nextActionButtons('equip'),
    });
  }
}

function requirePanelSession(interaction: ButtonInteraction, userId: string): boolean {
  const { session } = parseSessionCustomId(interaction.customId);
  if (!session) return false;
  if (!isPanelSessionValid(userId, session)) {
    void respondStale(interaction);
    return false;
  }
  return true;
}

function isPanelButton(customId: string, userId: string): boolean {
  const { session } = parseSessionCustomId(customId);
  return !!session && isPanelSessionValid(userId, session);
}

function stripSessionSelectId(customId: string): string {
  const { base } = parseSessionCustomId(customId);
  return base;
}

async function sendPanelSelectMessage(
  interaction: ButtonInteraction,
  userId: string,
  payload: UiPayload,
): Promise<void> {
  await disableOldComponents(interaction.message);
  const channel = getSendableChannel(interaction.channel);
  if (!channel) {
    await replyEphemeralNoChannel(interaction);
    return;
  }
  await interaction.deferUpdate();
  await channel.send(stampPanelPayload(userId, payload));
}

export async function handleUxButton(interaction: ButtonInteraction): Promise<boolean> {
  const { base } = parseSessionCustomId(interaction.customId);
  const userId = interaction.user.id;
  if (!getPlayer(userId)) {
    await interaction.reply({ embeds: [errorEmbed('未登録です。/start で旅を始めてください。')], ephemeral: true });
    return true;
  }

  if (base.startsWith('shop:repeat_buy:')) {
    const parts = base.split(':');
    const itemId = parts[2]!;
    const qty = Math.max(1, Number(parts[3] ?? 1));
    const { buyShopItem } = await import('../systems/shopSystem');
    const { getCurrentTown } = await import('../systems/townSystem');
    const { findFacilityInTown } = await import('../systems/facilitySystem');
    const town = getCurrentTown(userId) as { id: string } | undefined;
    const r = buyShopItem(userId, itemId, town?.id ?? 'start_starfield', qty);
    const shopFac = findFacilityInTown(userId, 'item_shop');
    await sendJourneyLog(interaction, {
      embeds: [r.ok ? successEmbed(r.message) : errorEmbed(r.message)],
      components: nextActionButtons('shop_buy_done', { facilityId: shopFac, itemId, qty }),
    });
    return true;
  }

  if (base.startsWith('upgrade:repeat:')) {
    const parts = base.split(':');
    const action = parts[2] as UpgradeActionKind;
    const invId = Number(parts[3]);
    const { handleUpgradeAction } = await import('../commands/upgrade');
    const { findFacilityInTown } = await import('../systems/facilitySystem');
    const result = handleUpgradeAction(userId, action, invId);
    const repairFac = findFacilityInTown(userId, 'repair_shop') ?? findFacilityInTown(userId, 'blacksmith');
    await sendJourneyLog(interaction, {
      ...result,
      components: nextActionButtons('upgrade_done', {
        facilityId: repairFac,
        inventoryId: invId,
        upgradeAction: action,
      }),
    });
    return true;
  }

  if (base.startsWith('rematch:repeat:')) {
    const monsterId = base.slice('rematch:repeat:'.length);
    const { startBossRematch } = await import('../systems/bossRematchSystem');
    const { buildBattleReply } = await import('../systems/battleSystem');
    const { findFacilityInTown } = await import('../systems/facilitySystem');
    const guildFac = findFacilityInTown(userId, 'guild_board');
    const r = startBossRematch(userId, monsterId);
    if (!r.ok || !r.battleId) {
      await sendJourneyLog(interaction, {
        embeds: [errorEmbed(r.message)],
        components: nextActionButtons('boss_rematch_done', { facilityId: guildFac, monsterId }),
      });
      return true;
    }
    const reply = buildBattleReply(r.battleId, userId);
    if (reply) {
      await sendJourneyLog(interaction, reply);
    } else {
      await sendJourneyLog(interaction, {
        embeds: [errorEmbed('戦闘の開始に失敗しました。')],
        components: nextActionButtons('boss_rematch_done', { facilityId: guildFac, monsterId }),
      });
    }
    return true;
  }

  if (base.startsWith('explore:repeat:')) {
    const areaId = base.slice('explore:repeat:'.length);
    if (!areaId) return false;
    await runExploreAction(interaction, userId, areaId);
    return true;
  }

  if (base.startsWith('prep:back:')) {
    await handlePrepBack(interaction, userId, base);
    return true;
  }

  if (base === 'town:home') {
    const payload = buildTownHub(userId);
    if (isPanelButton(interaction.customId, userId)) {
      await updateActionPanel(interaction, payload, userId);
    } else {
      await sendJourneyLog(interaction, payload);
    }
    return true;
  }

  if (base === 'town:facilities') {
    const payload = buildFacilityList(userId);
    if (requirePanelSession(interaction, userId)) {
      await updateActionPanel(interaction, payload, userId);
    } else {
      await sendPanelSelectMessage(interaction, userId, payload);
    }
    return true;
  }

  if (base === 'town:npcs') {
    const payload = buildNpcList(userId);
    if (requirePanelSession(interaction, userId)) {
      await updateActionPanel(interaction, payload, userId);
    } else {
      await sendPanelSelectMessage(interaction, userId, payload);
    }
    return true;
  }

  if (base === 'town:explore') {
    const payload = buildExploreList(userId);
    if (requirePanelSession(interaction, userId)) {
      await updateActionPanel(interaction, payload, userId);
    } else {
      await sendPanelSelectMessage(interaction, userId, payload);
    }
    return true;
  }

  if (base === 'town:travel') {
    const payload = buildTravelList(userId);
    if (requirePanelSession(interaction, userId)) {
      await updateActionPanel(interaction, payload, userId);
    } else {
      await sendPanelSelectMessage(interaction, userId, payload);
    }
    return true;
  }

  if (base === 'town:guide') {
    const payload = buildGuideHome(userId);
    if (requirePanelSession(interaction, userId)) {
      await updateActionPanel(interaction, payload, userId);
    } else {
      await sendPanelSelectMessage(interaction, userId, payload);
    }
    return true;
  }

  if (base.startsWith('guide:chapter:')) {
    const section = base.split(':')[2] ?? 'intro';
    const payload = buildGuideView(section);
    if (requirePanelSession(interaction, userId)) {
      await updateActionPanel(interaction, payload, userId);
    } else {
      await sendJourneyLog(interaction, payload);
    }
    return true;
  }

  if (base.startsWith('facility:view:')) {
    const facId = base.slice('facility:view:'.length);
    await sendJourneyLog(interaction, buildFacilityView(userId, facId));
    return true;
  }

  if (base.startsWith('facility:act:')) {
    const parsed = parseFacilityActionId(base);
    if (!parsed) return false;
    const { facId, action } = parsed;
    if (action === 'home') {
      await sendJourneyLog(interaction, buildTownHub(userId));
      return true;
    }
    const result = executeFacilityAction(userId, facId, action);
    await handleFacilityResult(interaction, userId, facId, result);
    return true;
  }

  if (base.startsWith('npc:view:')) {
    const npcId = base.slice('npc:view:'.length);
    await sendJourneyLog(interaction, buildNpcView(userId, npcId));
    return true;
  }

  if (base.startsWith('npc:act:')) {
    const parts = base.split(':');
    const npcId = parts[2]!;
    const act = parts[3] as 'smalltalk' | 'explain' | 'request' | 'hint';
    await sendJourneyLog(interaction, buildNpcDialogue(userId, npcId, act));
    return true;
  }

  if (base.startsWith('inventory:page:')) {
    const parts = base.split(':');
    if (parts[2] === 'noop') return true;
    const page = Math.max(0, Number(parts[2] ?? 0));
    const category = (parts[3] ?? 'all') as InventoryCategory;
    await sendJourneyLog(interaction, buildInventoryView(userId, page, category));
    return true;
  }

  if (base.startsWith('inventory:cat:')) {
    const category = (base.split(':')[2] ?? 'all') as InventoryCategory;
    await sendJourneyLog(interaction, buildInventoryView(userId, 0, category));
    return true;
  }

  if (base.startsWith('flow:')) {
    await handleFlowButton(interaction, base.slice(5));
    return true;
  }

  return false;
}

async function handleFacilityResult(
  interaction: ButtonInteraction,
  userId: string,
  facId: string,
  result: ReturnType<typeof executeFacilityAction>,
): Promise<void> {
  const facilityName = getFacilityName(facId);

  switch (result.type) {
    case 'text': {
      const restExtras = new Set(['rest_ok', 'already_full', 'insufficient_gold', 'rest_fail']);
      const { postRestButtons } = await import('../utils/townUi');
      await sendJourneyLog(interaction, {
        embeds: [townHubEmbed(getFacilityName(facId), result.message)],
        components: restExtras.has(result.extra ?? '')
          ? postRestButtons(facId)
          : nextActionButtons('facility', { facilityId: facId }),
      });
      break;
    }
    case 'profile': {
      recalculatePlayerStats(userId);
      await sendJourneyLog(interaction, {
        embeds: [playerRecordEmbed(getPlayer(userId)!, userId)],
        components: nextActionButtons('profile'),
      });
      break;
    }
    case 'inventory': {
      await sendJourneyLog(interaction, buildInventoryView(userId, 0));
      break;
    }
    case 'shop_browse':
    case 'shop_buy':
    case 'shop_sell':
    case 'market_browse':
    case 'market_sell':
    case 'market_my':
    case 'prep_equip':
    case 'prep_menu': {
      await handleShopMarketPrep(interaction, userId, facId, result);
      break;
    }
    case 'equip': {
      await sendJourneyLog(interaction, {
        embeds: [equipSummaryEmbed(formatEquipSummary(userId))],
        components: [detailOpenButton('equip'), ...nextActionButtons('equip')],
      });
      break;
    }
    case 'travel': {
      await sendPanelSelectMessage(interaction, userId, buildTravelList(userId));
      break;
    }
    case 'upgrade_select': {
      const items = getUpgradeSelectOptions(userId, result.extra ?? 'enhance');
      if (!items.length) {
        await sendJourneyLog(interaction, {
          embeds: [townHubEmbed(getFacilityName(facId), '対象となる装備がない。')],
          components: nextActionButtons('facility', { facilityId: facId }),
        });
        return;
      }
      await sendPanelAfterAction(interaction, userId, {
        embeds: [townHubEmbed(facilityName, result.message)],
        components: [
          selectMenu(`upgrade:${result.extra}`, '装備を選ぶ', items.map((i) => ({
            label: i.name, value: String(i.id), description: i.rarity,
          }))),
          detailOpenButton('upgrade'),
        ],
      });
      break;
    }
    case 'src_select': {
      const items = getSrcUniqueOptions(userId);
      if (!items.length) {
        await sendJourneyLog(interaction, {
          embeds: [townHubEmbed(getFacilityName(facId), '古い武器を持っていない。')],
          components: nextActionButtons('facility', { facilityId: facId }),
        });
        return;
      }
      await sendPanelAfterAction(interaction, userId, {
        embeds: [townHubEmbed(facilityName, result.message)],
        components: [selectMenu('upgrade:manifest', '武器を選ぶ', items.map((i) => ({
          label: i.name, value: String(i.id),
        })))],
      });
      break;
    }
    case 'job_select': {
      const jobs = getJobSelectOptions(userId);
      const player = getPlayer(userId)!;
      const isSub = player.main_job !== '未選択';
      await sendPanelAfterAction(interaction, userId, {
        embeds: [townHubEmbed(facilityName, result.message)],
        components: [selectMenu(isSub ? 'onboarding:job:sub' : 'onboarding:job:main', '職能を選ぶ', jobs.map((j) => ({ label: j, value: j })))],
      });
      break;
    }
    case 'rescue_hint':
    case 'raid_hint':
      await sendJourneyLog(interaction, {
        embeds: [townHubEmbed(getFacilityName(facId), result.message)],
        components: nextActionButtons('facility', { facilityId: facId }),
      });
      break;
    case 'coop_recruit': {
      const guild = interaction.guild;
      if (!guild) {
        await interaction.reply({ embeds: [errorEmbed('サーバー内でのみ募集できます。')], ephemeral: true });
        break;
      }
      const { postCoopRecruitToGuild } = await import('../systems/coop/coopHandlers');
      const extra = result.extra ?? 'rescue:explore';
      if (extra === 'raid') {
        const { canEnterValhalla } = await import('../systems/progressionGates');
        const gate = canEnterValhalla(userId);
        if (!gate.ok) {
          await sendJourneyLog(interaction, {
            embeds: [townHubEmbed(getFacilityName(facId), gate.reason ?? '条件未達')],
            components: nextActionButtons('facility', { facilityId: facId }),
          });
          break;
        }
        const posted = await postCoopRecruitToGuild(guild, userId, 'raid');
        await sendJourneyLog(interaction, {
          embeds: [townHubEmbed(getFacilityName(facId), posted.ok ? posted.message : posted.message)],
          components: nextActionButtons('facility', { facilityId: facId }),
        });
        break;
      }
      const rescueType = extra.includes('preemptive') ? 'preemptive' : 'explore';
      const posted = await postCoopRecruitToGuild(guild, userId, 'rescue', {
        rescue_type: rescueType,
        area_label: rescueType === 'preemptive' ? '高難度探索' : undefined,
      });
      await sendJourneyLog(interaction, {
        embeds: [townHubEmbed(getFacilityName(facId), posted.ok ? posted.message : posted.message)],
        components: nextActionButtons('facility', { facilityId: facId }),
      });
      break;
    }
    case 'boss_rematch_select': {
      const { getRematchableBosses } = await import('../systems/bossRematchSystem');
      const bosses = getRematchableBosses(userId);
      await sendPanelAfterAction(interaction, userId, {
        embeds: [townHubEmbed(facilityName, result.message)],
        components: [selectMenu('rematch:boss', '再戦するボス', bosses.slice(0, 25).map((b) => ({
          label: b.name,
          value: b.monsterId,
          description: b.category === 'material' ? '素材' : '章ボス',
        })))],
      });
      break;
    }
    case 'inn_preview': {
      const { restConfirmButtons } = await import('../utils/townUi');
      const mode = result.extra === 'shrine' ? 'shrine' : 'inn';
      await sendJourneyLog(interaction, {
        embeds: [townHubEmbed(getFacilityName(facId), result.message)],
        components: restConfirmButtons(facId, mode),
      });
      break;
    }
    default:
      await sendJourneyLog(interaction, buildFacilityView(userId, facId));
  }
}

async function sendPanelAfterAction(
  interaction: ButtonInteraction,
  userId: string,
  payload: UiPayload,
): Promise<void> {
  await disableOldComponents(interaction.message);
  const channel = getSendableChannel(interaction.channel);
  if (!channel) {
    await replyEphemeralNoChannel(interaction);
    return;
  }
  await interaction.deferUpdate();
  await channel.send(stampPanelPayload(userId, payload));
}

function getFacilityName(facId: string): string {
  return getFacility(facId)?.name ?? '—';
}

async function handleShopMarketPrep(
  interaction: ButtonInteraction,
  userId: string,
  facId: string,
  result: ReturnType<typeof executeFacilityAction>,
): Promise<void> {
  const { getCurrentTown } = await import('../systems/townSystem');
  const { getShopCatalog, getSellableInventory } = await import('../systems/shopSystem');
  const { getActiveListings, getMyListings } = await import('../systems/marketSystem');
  const { PREP_SLOTS } = await import('../systems/prepSystem');
  const town = getCurrentTown(userId) as { id: string } | undefined;

  if (result.type === 'shop_browse') {
    await sendJourneyLog(interaction, {
      embeds: [townHubEmbed(getFacilityName(facId), result.message)],
      components: nextActionButtons('facility', { facilityId: facId }),
    });
    return;
  }
  if (result.type === 'shop_buy') {
    const catalog = getShopCatalog(town?.id ?? 'start_starfield').slice(0, 25);
    await sendPanelAfterAction(interaction, userId, {
      embeds: [townHubEmbed(getFacilityName(facId), result.message)],
      components: [
        selectMenu('shop:buy', '品を選ぶ', catalog.map((c) => ({
          label: c.name, value: c.item_id, description: `${c.buy_price}G`,
        }))),
        selectMenu('detail:shop', '商品詳細', catalog.map((c) => ({
          label: c.name, value: c.item_id, description: `${c.buy_price}G [${c.rarity}]`.slice(0, 100),
        }))),
        detailOpenButton('shop_buy'),
      ],
    });
    return;
  }
  if (result.type === 'shop_sell') {
    const items = getSellableInventory(userId);
    if (!items.length) {
      await sendJourneyLog(interaction, {
        embeds: [townHubEmbed(getFacilityName(facId), '売れる品がない。')],
        components: nextActionButtons('facility', { facilityId: facId }),
      });
      return;
    }
    await sendPanelAfterAction(interaction, userId, {
      embeds: [townHubEmbed(getFacilityName(facId), result.message)],
      components: [
        selectMenu('shop:sell', '売る品を選ぶ', items.slice(0, 25).map((i) => ({
          label: i.name, value: String(i.id), description: `[${i.rarity}] x${i.quantity}`,
        }))),
        selectMenu('detail:inv', '詳細を見る', items.slice(0, 25).map((i) => ({
          label: i.name, value: String(i.id), description: i.rarity,
        }))),
        detailOpenButton('shop_sell'),
      ],
    });
    return;
  }
  if (result.type === 'market_browse') {
    const listings = getActiveListings(15) as Array<{ id: string; name: string; price: number }>;
    await sendPanelAfterAction(interaction, userId, {
      embeds: [townHubEmbed(getFacilityName(facId), result.message)],
      components: [
        selectMenu('market:buy', '購入する出品', listings.map((l) => ({
          label: l.name, value: l.id, description: `${l.price}G`,
        }))),
        selectMenu('detail:listing', '出品詳細', listings.map((l) => ({
          label: l.name, value: l.id, description: `${l.price}G`,
        }))),
      ],
    });
    return;
  }
  if (result.type === 'market_sell') {
    const items = getSellableInventory(userId).filter((i) => i.category === 'equipment' || i.quantity === 1);
    await sendPanelAfterAction(interaction, userId, {
      embeds: [townHubEmbed(getFacilityName(facId), result.message)],
      components: [selectMenu('market:list', '出品する品', items.slice(0, 25).map((i) => ({
        label: i.name, value: String(i.id),
      })))],
    });
    return;
  }
  if (result.type === 'market_my') {
    const mine = getMyListings(userId) as Array<{ id: string; name: string; price: number }>;
    await sendPanelAfterAction(interaction, userId, {
      embeds: [townHubEmbed(getFacilityName(facId), mine.length ? mine.map((m) => `${m.name} ${m.price}G`).join('\n') : '出品なし')],
      components: mine.length ? [selectMenu('market:cancel', '取り下げ', mine.map((m) => ({
        label: m.name, value: m.id, description: `${m.price}G`,
      })))] : nextActionButtons('facility', { facilityId: facId }),
    });
    return;
  }
  if (result.type === 'prep_equip') {
    await sendPanelAfterAction(interaction, userId, {
      embeds: [townHubEmbed('身支度', result.message)],
      components: [
        selectMenu('prep:slot', '部位を選ぶ', PREP_SLOTS.map((s) => ({
          label: ({ weapon: '武器', head: '頭', body: '胴', arms: '腕', legs: '脚', feet: '靴', accessory1: 'アクセ1', accessory2: 'アクセ2', sub: '補助' } as Record<string, string>)[s] ?? s,
          value: s,
        }))),
        detailOpenButton('equip'),
      ],
    });
    return;
  }
  if (result.type === 'prep_menu') {
    await sendJourneyLog(interaction, {
      embeds: [equipSummaryEmbed(result.message)],
      components: nextActionButtons('equip'),
    });
  }
}

async function handleFlowButton(interaction: ButtonInteraction, flow: string): Promise<void> {
  const userId = interaction.user.id;
  if (flow.startsWith('explore:')) {
    const areaId = flow.slice('explore:'.length);
    await runExploreAction(interaction, userId, areaId);
    return;
  }
  if (flow === 'inventory') {
    await sendJourneyLog(interaction, buildInventoryView(userId, 0));
    return;
  }
  if (flow === 'equip') {
    await sendJourneyLog(interaction, {
      embeds: [equipSummaryEmbed(formatEquipSummary(userId))],
      components: [detailOpenButton('equip'), ...nextActionButtons('equip')],
    });
    return;
  }
  if (flow === 'profile') {
    recalculatePlayerStats(userId);
    await sendJourneyLog(interaction, {
      embeds: [playerRecordEmbed(getPlayer(userId)!, userId)],
      components: nextActionButtons('profile'),
    });
    return;
  }
  if (flow === 'rescue') {
    const guild = interaction.guild;
    if (!guild) {
      await sendJourneyLog(interaction, {
        embeds: [townHubEmbed('救難', 'サーバー内でのみ救難要請を出せます。')],
        components: nextActionButtons('defeat'),
      });
      return;
    }
    const { postCoopRecruitToGuild } = await import('../systems/coop/coopHandlers');
    const posted = await postCoopRecruitToGuild(guild, userId, 'rescue', { rescue_type: 'explore' });
    await sendJourneyLog(interaction, {
      embeds: [townHubEmbed('救難', posted.ok ? posted.message : posted.message)],
      components: nextActionButtons('defeat'),
    });
    return;
  }
  if (flow === 'raid') {
    const guild = interaction.guild;
    if (!guild) {
      await sendJourneyLog(interaction, {
        embeds: [townHubEmbed('レイド', 'サーバー内でのみレイド募集を出せます。')],
        components: nextActionButtons('facility'),
      });
      return;
    }
    const { canEnterValhalla } = await import('../systems/progressionGates');
    const gate = canEnterValhalla(userId);
    if (!gate.ok) {
      await sendJourneyLog(interaction, {
        embeds: [townHubEmbed('レイド', gate.reason ?? '条件未達')],
        components: nextActionButtons('facility'),
      });
      return;
    }
    const { postCoopRecruitToGuild } = await import('../systems/coop/coopHandlers');
    const posted = await postCoopRecruitToGuild(guild, userId, 'raid');
    await sendJourneyLog(interaction, {
      embeds: [townHubEmbed('レイド', posted.ok ? posted.message : posted.message)],
      components: nextActionButtons('facility'),
    });
  }
}

export async function handleUxSelect(interaction: StringSelectMenuInteraction): Promise<boolean> {
  const base = stripSessionSelectId(interaction.customId);
  const userId = interaction.user.id;
  const value = interaction.values[0]!;

  const panelSelectIds = ['town:fac_pick', 'town:npc_pick', 'guide:section', 'town:travel', 'explore:select'];
  const { session } = parseSessionCustomId(interaction.customId);
  if (panelSelectIds.some((p) => base === p || base.startsWith(`${p}:`))) {
    if (session && !isPanelSessionValid(userId, session)) {
      await respondStale(interaction);
      return true;
    }
  }

  if (base === 'town:fac_pick' || base.startsWith('town:fac_pick:')) {
    await sendJourneyLogAfterSelect(interaction, buildFacilityView(userId, value));
    return true;
  }
  if (base === 'town:npc_pick' || base.startsWith('town:npc_pick:')) {
    await sendJourneyLogAfterSelect(interaction, buildNpcView(userId, value));
    return true;
  }
  if (base === 'guide:section' || base.startsWith('guide:section:')) {
    await sendJourneyLogAfterSelect(interaction, buildGuideView(value));
    return true;
  }

  return false;
}
