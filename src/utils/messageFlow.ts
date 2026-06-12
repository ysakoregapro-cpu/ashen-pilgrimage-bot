import {
  ActionRowBuilder,
  ButtonBuilder,
  ComponentType,
  Message,
  StringSelectMenuBuilder,
  type ButtonInteraction,
  type MessageActionRowComponentBuilder,
  type MessageComponentInteraction,
  type MessageCreateOptions,
  type StringSelectMenuInteraction,
  type Message as DiscordMessage,
} from 'discord.js';
import { errorEmbed } from './embeds';
import { errorRecoveryPayload } from './nextActionButtons';
import type { UiPayload } from './townUi';

const NO_CHANNEL_MESSAGE = 'ここではログを表示できません。\n町の操作パネルがあるチャンネルで試してください。';

const STALE_MESSAGE =
  'この操作は古くなっています。もう一度開き直してください。';

const userPanelSession = new Map<string, string>();
const userPanelMessageId = new Map<string, string>();

let sessionSeq = 0;

export function refreshPanelSession(userId: string): string {
  const id = `${Date.now().toString(36)}${(sessionSeq++).toString(36)}`.slice(-12);
  userPanelSession.set(userId, id);
  return id;
}

export function getPanelSession(userId: string): string {
  return userPanelSession.get(userId) ?? refreshPanelSession(userId);
}

export function bindPanelSession(userId: string, sessionId: string): void {
  userPanelSession.set(userId, sessionId);
}

export function isPanelSessionValid(userId: string, sessionId: string | undefined): boolean {
  if (!sessionId) return false;
  return userPanelSession.get(userId) === sessionId;
}

export function rememberPanelMessage(userId: string, messageId: string): void {
  userPanelMessageId.set(userId, messageId);
}

export function parseSessionCustomId(customId: string): { base: string; session?: string } {
  const marker = ':s:';
  const idx = customId.lastIndexOf(marker);
  if (idx === -1) return { base: customId };
  return { base: customId.slice(0, idx), session: customId.slice(idx + marker.length) };
}

export function withPanelSession(baseId: string, session: string): string {
  const id = `${baseId}:s:${session}`;
  return id.length <= 100 ? id : baseId.slice(0, 100 - session.length - 3) + `:s:${session}`;
}

type ChannelWithSend = {
  isSendable?: () => boolean;
  send: (options: MessageCreateOptions) => Promise<DiscordMessage>;
};

export function getSendableChannel(channel: unknown): ChannelWithSend | null {
  if (!channel || typeof channel !== 'object' || !('send' in channel)) return null;
  const ch = channel as ChannelWithSend;
  if (typeof ch.isSendable === 'function' && !ch.isSendable()) return null;
  return ch;
}

export function stampPanelPayload(userId: string, payload: UiPayload): UiPayload {
  const session = refreshPanelSession(userId);
  return {
    embeds: payload.embeds,
    components: stampComponents(payload.components, session),
  };
}

function stampComponents(
  rows: ActionRowBuilder<MessageActionRowComponentBuilder>[],
  session: string,
): ActionRowBuilder<MessageActionRowComponentBuilder>[] {
  return rows.map((row) => {
    const next = new ActionRowBuilder<MessageActionRowComponentBuilder>();
    for (const component of row.components) {
      if (component instanceof ButtonBuilder) {
        const json = component.toJSON();
        const id = 'custom_id' in json ? json.custom_id : undefined;
        const btn = ButtonBuilder.from(json);
        if (id && isPanelScopedId(id)) btn.setCustomId(withPanelSession(id, session));
        next.addComponents(btn);
      } else if (component instanceof StringSelectMenuBuilder) {
        const json = component.toJSON();
        const id = json.custom_id;
        const menu = StringSelectMenuBuilder.from(json);
        if (id && isPanelScopedId(id)) menu.setCustomId(withPanelSession(id, session));
        next.addComponents(menu);
      }
    }
    return next;
  });
}

const PANEL_PREFIXES = [
  'town:home',
  'town:facilities',
  'town:npcs',
  'town:explore',
  'town:travel',
  'town:guide',
  'guide:section',
  'guide:chapter',
  'town:fac_pick',
  'town:npc_pick',
  'explore:select',
  'onboarding:job:main',
  'onboarding:job:sub',
  'upgrade:enhance',
  'upgrade:repair',
  'upgrade:dismantle',
  'upgrade:src',
  'upgrade:manifest',
  'equip:select',
];

function isPanelScopedId(id: string): boolean {
  if (id.startsWith('guide:chapter:')) return true;
  return PANEL_PREFIXES.some((p) => id === p || id.startsWith(`${p}:`));
}

export async function disableOldComponents(message: Message | null | undefined): Promise<void> {
  if (!message?.editable || !message.components.length) return;
  const rows: ActionRowBuilder<MessageActionRowComponentBuilder>[] = [];
  for (const row of message.components) {
    if (row.type !== ComponentType.ActionRow) continue;
    const next = new ActionRowBuilder<MessageActionRowComponentBuilder>();
    for (const c of row.components) {
      if (c.type === ComponentType.Button) {
        next.addComponents(ButtonBuilder.from(c).setDisabled(true));
      } else if (c.type === ComponentType.StringSelect) {
        next.addComponents(StringSelectMenuBuilder.from(c).setDisabled(true));
      }
    }
    rows.push(next);
  }
  await message.edit({ components: rows }).catch(() => {});
}

export async function respondStale(interaction: MessageComponentInteraction): Promise<void> {
  if (interaction.deferred || interaction.replied) {
    await interaction.followUp({ embeds: [errorEmbed(STALE_MESSAGE)], ephemeral: true }).catch(() => {});
    return;
  }
  await interaction.reply({ embeds: [errorEmbed(STALE_MESSAGE)], ephemeral: true }).catch(() => {});
}

export async function updateActionPanel(
  interaction: MessageComponentInteraction,
  payload: UiPayload,
  userId: string,
): Promise<void> {
  const stamped = stampPanelPayload(userId, payload);
  await interaction.update(stamped);
  rememberPanelMessage(userId, interaction.message.id);
}

export async function sendChannelLog(channel: ChannelWithSend, payload: UiPayload | MessageCreateOptions): Promise<void> {
  await channel.send(payload);
}

export async function replyEphemeralNoChannel(interaction: MessageComponentInteraction): Promise<void> {
  const recovery = errorRecoveryPayload(NO_CHANNEL_MESSAGE);
  const body = { embeds: recovery.embeds, components: recovery.components, ephemeral: true as const };
  if (interaction.deferred || interaction.replied) {
    await interaction.followUp(body).catch(() => {});
    return;
  }
  await interaction.reply(body).catch(() => {});
}

export async function sendJourneyLog(
  interaction: MessageComponentInteraction,
  payload: UiPayload,
  opts?: { disableSource?: boolean },
): Promise<void> {
  if (opts?.disableSource !== false) {
    await disableOldComponents(interaction.message);
  }

  const channel = getSendableChannel(interaction.channel);
  if (!channel) {
    await replyEphemeralNoChannel(interaction);
    return;
  }

  if (interaction.deferred || interaction.replied) {
    await channel.send({ embeds: payload.embeds, components: payload.components });
    return;
  }

  if (interaction.isButton() || interaction.isStringSelectMenu()) {
    await interaction.deferUpdate();
    await channel.send({ embeds: payload.embeds, components: payload.components });
  }
}

export async function sendJourneyLogAfterSelect(
  interaction: StringSelectMenuInteraction,
  payload: UiPayload,
): Promise<void> {
  await disableOldComponents(interaction.message);
  const channel = getSendableChannel(interaction.channel);
  if (!channel) {
    await replyEphemeralNoChannel(interaction);
    return;
  }
  await interaction.deferUpdate();
  await channel.send({ embeds: payload.embeds, components: payload.components });
}

export async function sendJourneyLogFromButton(
  interaction: ButtonInteraction,
  payload: UiPayload,
): Promise<void> {
  await sendJourneyLog(interaction, payload);
}

export function panelSessionFromInteraction(customId: string, userId: string): boolean {
  const { session } = parseSessionCustomId(customId);
  if (!session) return false;
  return isPanelSessionValid(userId, session);
}
