import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type MessageActionRowComponentBuilder,
} from 'discord.js';
import { sanitizeComponents } from './componentSafety';
import type { UiPayload } from './townUi';
import type { UpgradeActionKind } from './nextActionButtons';

function btn(id: string, label: string, style: ButtonStyle): ButtonBuilder {
  return new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style);
}

export function buildBackButton(context: string, payload = ''): ButtonBuilder {
  const id = payload ? `nav:back:${context}:${payload}` : `nav:back:${context}`;
  return btn(id, 'ひとつ戻る', ButtonStyle.Secondary);
}

export function buildTownButton(): ButtonBuilder {
  return btn('town:home', '街に戻る', ButtonStyle.Secondary);
}

export function buildConfirmButton(confirmId: string, label: string, style = ButtonStyle.Success, disabled = false): ButtonBuilder {
  return new ButtonBuilder().setCustomId(confirmId).setLabel(label).setStyle(style).setDisabled(disabled);
}

export function buildCancelButton(cancelId: string, label = 'やめる'): ButtonBuilder {
  return btn(cancelId, label, ButtonStyle.Secondary);
}

export type ConfirmNavOpts = {
  confirmId: string;
  confirmLabel: string;
  confirmStyle?: ButtonStyle;
  backContext: string;
  backPayload?: string;
  disabled?: boolean;
};

export function buildConfirmNavigationRows(opts: ConfirmNavOpts): ActionRowBuilder<ButtonBuilder>[] {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      buildConfirmButton(opts.confirmId, opts.confirmLabel, opts.confirmStyle ?? ButtonStyle.Success, opts.disabled ?? false),
    ),
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      buildBackButton(opts.backContext, opts.backPayload ?? ''),
      buildTownButton(),
    ),
  ];
}

export function prependConfirmNavigation(
  components: ActionRowBuilder<MessageActionRowComponentBuilder>[],
  navRows: ActionRowBuilder<ButtonBuilder>[],
): ActionRowBuilder<MessageActionRowComponentBuilder>[] {
  return sanitizeComponents([...navRows, ...components], 'confirm-nav') as ActionRowBuilder<MessageActionRowComponentBuilder>[];
}

export function withSanitizedComponents(payload: UiPayload, tag: string): UiPayload {
  return {
    ...payload,
    components: sanitizeComponents(payload.components ?? [], tag) as ActionRowBuilder<MessageActionRowComponentBuilder>[],
  };
}

export function upgradeBackPayload(action: UpgradeActionKind, facilityId: string): string {
  return `${action}:${facilityId}`;
}

export function buildSelectNavigationRow(backContext: string, backPayload = ''): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    buildBackButton(backContext, backPayload),
    buildTownButton(),
  );
}

/** Select画面末尾に戻る/街へ — 5行制限時は街へ戻るのみ */
export function appendSelectNavigation(
  components: ActionRowBuilder<MessageActionRowComponentBuilder>[],
  backContext: string,
  backPayload = '',
  tag = 'select-nav',
): ActionRowBuilder<MessageActionRowComponentBuilder>[] {
  if (components.length >= 5) {
    return sanitizeComponents(
      [...components.slice(0, 4), new ActionRowBuilder<ButtonBuilder>().addComponents(buildTownButton())],
      tag,
    ) as ActionRowBuilder<MessageActionRowComponentBuilder>[];
  }
  return sanitizeComponents(
    [...components, buildSelectNavigationRow(backContext, backPayload)],
    tag,
  ) as ActionRowBuilder<MessageActionRowComponentBuilder>[];
}

export function parseUpgradeBackPayload(payload: string): { action: UpgradeActionKind; facilityId: string } | null {
  const sep = payload.indexOf(':');
  if (sep <= 0) return null;
  return {
    action: payload.slice(0, sep) as UpgradeActionKind,
    facilityId: payload.slice(sep + 1),
  };
}
