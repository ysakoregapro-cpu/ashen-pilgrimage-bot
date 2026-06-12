import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder,
  type ColorResolvable,
} from 'discord.js';
import { RARITY_EMOJI, type DurabilityState, type Player, type Rarity } from '../types';
import { COLORS, hpBar, breakBar, formatFieldTitle, formatBulletList } from './formatters';

const THEME_COLOR = COLORS.town;

export function baseEmbed(title: string, description?: string): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(THEME_COLOR)
    .setTitle(`灰星巡礼録 | ${title}`)
    .setFooter({ text: '灰星巡礼録' })
    .setTimestamp();
  if (description) embed.setDescription(description);
  return embed;
}

export function playerEmbed(player: Player): EmbedBuilder {
  return baseEmbed('プロフィール')
    .addFields(
      { name: '名前', value: player.name, inline: true },
      { name: 'Lv', value: `${player.level}`, inline: true },
      { name: '所持金', value: `${player.gold}G`, inline: true },
      { name: '職能', value: player.main_job, inline: true },
      { name: '副職', value: player.sub_job ?? '—', inline: true },
      { name: '現在地', value: player.current_town_id, inline: true },
      { name: 'HP / MP', value: `${player.hp}/${player.max_hp} / ${player.mp}/${player.max_mp}`, inline: false },
      { name: '基礎能力', value: `攻${player.attack} 魔${player.magic} 防${player.defense} 精${player.spirit} 速${player.speed}`, inline: false },
    );
}

export function itemLine(name: string, rarity: Rarity, extra?: string): string {
  const emoji = RARITY_EMOJI[rarity];
  return `${emoji} **${name}**${extra ? ` — ${extra}` : ''}`;
}

export function durabilityLabel(state: DurabilityState): string {
  const icons: Record<DurabilityState, string> = { 良好: '🟢', 摩耗: '🟡', 損傷: '🟠', 破損: '🔴' };
  return `${icons[state]} ${state}`;
}

export function errorEmbed(message: string): EmbedBuilder {
  return baseEmbed('エラー', message).setColor(COLORS.battle);
}

export function successEmbed(message: string): EmbedBuilder {
  return baseEmbed('完了', message).setColor(COLORS.victory);
}

export function battleEmbed(
  title: string,
  playerHp: number,
  playerMaxHp: number,
  playerMp: number,
  playerMaxMp: number,
  enemyName: string,
  enemyHp: number,
  enemyMaxHp: number,
  enemyBreak: number,
  enemyBreakMax: number,
  log: string[],
  extraNote?: string,
): EmbedBuilder {
  const logText = log.slice(-5).join('\n\n') || '—';
  const embed = baseEmbed(title === '技と術' || title === '所持品' ? title : '戦闘')
    .setColor(COLORS.battle)
    .addFields(
      {
        name: '🔵 あなた',
        value: `HP ${hpBar(playerHp, playerMaxHp)}\nMP ${playerMp}/${playerMaxMp}`,
        inline: true,
      },
      {
        name: enemyName === '—' ? '—' : `🔴 ${enemyName}`,
        value: enemyName === '—'
          ? '—'
          : `HP ${hpBar(enemyHp, enemyMaxHp)}\n${breakBar(enemyBreak, enemyBreakMax)}`,
        inline: true,
      },
      { name: '戦いの流れ', value: extraNote ? `${extraNote}\n\n${logText}` : logText, inline: false },
    );
  return embed;
}

export function battleEmbedMulti(
  title: string,
  playerHp: number,
  playerMaxHp: number,
  playerMp: number,
  playerMaxMp: number,
  enemies: Array<{ label: string; name: string; hp: number; max_hp: number; break: number; break_max: number; is_alive?: boolean }>,
  log: string[],
  extraNote?: string,
  partySize?: number,
): EmbedBuilder {
  const logText = log.slice(-5).join('\n\n') || '—';
  const labeled = (partySize ?? enemies.filter((e) => e.is_alive !== false).length) > 1;
  const embed = baseEmbed(title === '対象選択' || title === '技と術' || title === '所持品' ? title : '戦闘')
    .setColor(COLORS.battle)
    .addFields({
      name: '🔵 あなた',
      value: `HP ${hpBar(playerHp, playerMaxHp)}\nMP ${playerMp}/${playerMaxMp}`,
      inline: false,
    });
  for (const e of enemies) {
    if (e.is_alive === false) continue;
    embed.addFields({
      name: labeled ? `🔴 ${e.label}: ${e.name}` : `🔴 ${e.name}`,
      value: `HP ${hpBar(e.hp, e.max_hp)}\n${breakBar(e.break, e.break_max)}`,
      inline: true,
    });
  }
  embed.addFields({ name: '戦いの流れ', value: extraNote ? `${extraNote}\n\n${logText}` : logText, inline: false });
  return embed;
}

export function townMenuEmbed(
  townName: string,
  intro: string,
  fields: Array<{ label: string; items: string[] }>,
): EmbedBuilder {
  const embed = baseEmbed(townName, intro);
  for (const f of fields) {
    embed.addFields({ name: formatFieldTitle(f.label), value: formatBulletList(f.items), inline: false });
  }
  return embed;
}

export function battleButtons(sessionId: string, canFlee = true, canRescue = true): ActionRowBuilder<ButtonBuilder>[] {
  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`battle:${sessionId}:attack`).setLabel('攻撃').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`battle:${sessionId}:skill_menu`).setLabel('スキル').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`battle:${sessionId}:defend`).setLabel('防御').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`battle:${sessionId}:item_menu`).setLabel('アイテム').setStyle(ButtonStyle.Secondary),
  );
  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`battle:${sessionId}:flee`).setLabel('逃走').setStyle(ButtonStyle.Secondary).setDisabled(!canFlee),
    new ButtonBuilder().setCustomId(`battle:${sessionId}:rescue`).setLabel('救難要請').setStyle(ButtonStyle.Success).setDisabled(!canRescue),
  );
  return [row1, row2];
}

export function selectMenu(
  customId: string,
  placeholder: string,
  options: { label: string; value: string; description?: string }[],
): ActionRowBuilder<StringSelectMenuBuilder> {
  const sliced = options.slice(0, 25);
  if (sliced.length === 0) {
    throw new Error(`selectMenu "${customId}" requires 1–25 options (got 0)`);
  }
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(customId)
      .setPlaceholder(placeholder)
      .addOptions(
        sliced.map((o) => ({
          label: o.label.slice(0, 100),
          value: o.value.slice(0, 100),
          description: o.description?.slice(0, 100),
        })),
      ),
  );
}

/** Returns null when options is empty — Discord requires 1–25 options per select menu. */
export function safeSelectMenu(
  customId: string,
  placeholder: string,
  options: { label: string; value: string; description?: string }[],
): ActionRowBuilder<StringSelectMenuBuilder> | null {
  if (!options.length) return null;
  return selectMenu(customId, placeholder, options);
}
