import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { getPlayer } from '../systems/playerSystem';
import {
  enhanceEquipment, dismantleEquipment, repairEquipment, getSrcUpgradeInfo,
  enhanceSrcWeapon, listMaterials, getEnhanceableEquipment,
} from '../systems/upgradeSystem';
import { getSrcManifestInfo, manifestSrcWeapon } from '../systems/srcWeaponSystem';
import { awakenEquipment, getAwakeningInfo, getAwakeningCandidates } from '../systems/awakeningSystem';
import { kaiUniqueTransform, kaiSrcTransform, getKaiUniqueInfo, getKaiSrcInfo } from '../systems/kaiForgeSystem';
import { recalculatePlayerStats } from '../systems/playerSystem';
import { detailOpenButton } from '../systems/itemDetailSystem';
import {
  mapInventoryRowToEquipmentSelect,
  toOwnedEquipmentSelectOption,
} from '../systems/equipmentLabelSystem';
import { baseEmbed, errorEmbed, successEmbed, selectMenu } from '../utils/embeds';
import { safeDefer, safeEdit } from '../utils/interaction';

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

  const items = getEnhanceableEquipment(userId) as Array<{
    id: number; name: string; rarity: string; upgrade_level: number; src_level: number;
    durability_state: string; is_equipped: number; awakening_level: number; slot: string;
  }>;
  const filter = sub === 'manifest'
    ? items.filter((i) => i.rarity === 'SR')
    : sub === 'awaken'
      ? getAwakeningCandidates(userId).map((i) => ({
        id: i.id, name: i.name, rarity: i.rarity, upgrade_level: i.upgrade_level,
        src_level: 0, durability_state: '良好', is_equipped: 0, awakening_level: i.awakening_level, slot: i.slot,
      }))
      : sub === 'repair'
        ? items.filter((i) => i.durability_state !== '良好')
        : sub === 'src'
          ? items.filter((i) => i.rarity === 'Src' || i.src_level > 0)
          : items;

  if (!filter.length) {
    await safeEdit(interaction, { embeds: [errorEmbed('対象装備がありません。')] });
    return;
  }

  const actionMap: Record<string, string> = {
    enhance: 'upgrade:enhance', dismantle: 'upgrade:dismantle', repair: 'upgrade:repair',
    src: 'upgrade:src', manifest: 'upgrade:manifest', awaken: 'upgrade:awaken',
  };
  await safeEdit(interaction, {
    embeds: [baseEmbed('装備選択', `${sub} する装備を選んでください`)],
    components: [
      selectMenu(actionMap[sub]!, '装備を選択', filter.slice(0, 25).map((i) =>
        toOwnedEquipmentSelectOption(mapInventoryRowToEquipmentSelect(i)),
      )),
      detailOpenButton('upgrade'),
    ],
  });
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
