import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { getPlayer } from '../systems/playerSystem';
import {
  enhanceEquipment, dismantleEquipment, repairEquipment, getSrcUpgradeInfo,
  enhanceSrcWeapon, listMaterials,
} from '../systems/upgradeSystem';
import { getSrcManifestInfo, manifestSrcWeapon } from '../systems/srcWeaponSystem';
import { awakenEquipment, getAwakeningInfo } from '../systems/awakeningSystem';
import { kaiUniqueTransform, kaiSrcTransform, getKaiUniqueInfo, getKaiSrcInfo } from '../systems/kaiForgeSystem';
import { recalculatePlayerStats } from '../systems/playerSystem';
import { buildUpgradeSelectPayload, resolveUpgradeFacilityId } from '../systems/upgradeConfirmSystem';
import { countUpgradeSelectOptions } from '../systems/facilitySystem';
import { baseEmbed, errorEmbed, successEmbed } from '../utils/embeds';
import { safeDefer, safeEdit } from '../utils/interaction';
import type { UpgradeActionKind } from '../utils/nextActionButtons';

export const data = new SlashCommandBuilder()
  .setName('upgrade')
  .setDescription('装備強化・分解・修理・Src')
  .addSubcommand((s) => s.setName('enhance').setDescription('装備強化'))
  .addSubcommand((s) => s.setName('dismantle').setDescription('装備分解'))
  .addSubcommand((s) => s.setName('repair').setDescription('装備修理'))
  .addSubcommand((s) => s.setName('src').setDescription('Src強化情報・実行'))
  .addSubcommand((s) => s.setName('manifest').setDescription('ユニーク武器をSrc化（従来）'))
  .addSubcommand((s) => s.setName('materials').setDescription('素材一覧'));

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await safeDefer(interaction);
  const userId = interaction.user.id;
  if (!getPlayer(userId)) { await safeEdit(interaction, { embeds: [errorEmbed('未登録です。')] }); return; }

  const sub = interaction.options.getSubcommand();

  if (sub === 'materials') {
    await safeEdit(interaction, { embeds: [baseEmbed('素材一覧', listMaterials(userId))] });
    return;
  }

  const actionMap: Record<string, UpgradeActionKind> = {
    enhance: 'enhance', dismantle: 'dismantle', repair: 'repair',
    src: 'src', manifest: 'manifest',
  };
  const action = actionMap[sub];
  if (!action) {
    await safeEdit(interaction, { embeds: [errorEmbed('不明なサブコマンドです。')] });
    return;
  }
  if (countUpgradeSelectOptions(userId, action) === 0) {
    await safeEdit(interaction, { embeds: [errorEmbed('対象装備がありません。')] });
    return;
  }
  const fac = resolveUpgradeFacilityId(userId);
  const payload = buildUpgradeSelectPayload(userId, action, fac, 0);
  await safeEdit(interaction, payload);
}

export function handleUpgradeAction(userId: string, action: string, inventoryId: number): { embeds: ReturnType<typeof baseEmbed>[] } {
  if (action === 'enhance') {
    const r = enhanceEquipment(userId, inventoryId);
    return { embeds: [r.success ? successEmbed(r.message) : errorEmbed(r.message)] };
  }
  if (action === 'dismantle') {
    const r = dismantleEquipment(userId, inventoryId);
    return { embeds: [r.success ? successEmbed(r.message) : errorEmbed(r.message)] };
  }
  if (action === 'repair') {
    const r = repairEquipment(userId, inventoryId);
    return { embeds: [r.success ? successEmbed(r.message) : errorEmbed(r.message)] };
  }
  if (action === 'src') {
    const info = getSrcUpgradeInfo(userId, inventoryId);
    const r = enhanceSrcWeapon(userId, inventoryId);
    if (r.success) return { embeds: [successEmbed(r.message)] };
    return { embeds: [baseEmbed('Src強化', info + '\n\n' + r.message)] };
  }
  if (action === 'manifest') {
    const info = getSrcManifestInfo(userId, inventoryId);
    const r = manifestSrcWeapon(userId, inventoryId);
    if (r.success) return { embeds: [successEmbed(r.message)] };
    return { embeds: [baseEmbed('Src発現', info + '\n\n' + r.message)] };
  }
  if (action === 'awaken') {
    const info = getAwakeningInfo(userId, inventoryId);
    const r = awakenEquipment(userId, inventoryId);
    if (r.success) recalculatePlayerStats(userId);
    return { embeds: [r.success ? successEmbed(`${info}\n\n${r.message}`) : baseEmbed('覚醒', `${info}\n\n${r.message}`)] };
  }
  if (action === 'kai_unique') {
    const info = getKaiUniqueInfo(userId, inventoryId);
    const r = kaiUniqueTransform(userId, inventoryId);
    return { embeds: [r.success ? successEmbed(`${info}\n\n${r.message}`) : baseEmbed('カイの昇華', `${info}\n\n${r.message}`)] };
  }
  if (action === 'kai_src') {
    const info = getKaiSrcInfo(userId, inventoryId);
    const r = kaiSrcTransform(userId, inventoryId);
    return { embeds: [r.success ? successEmbed(`${info}\n\n${r.message}`) : baseEmbed('Src昇華', `${info}\n\n${r.message}`)] };
  }
  return { embeds: [errorEmbed('不明なアクション')] };
}
