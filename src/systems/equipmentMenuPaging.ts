import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type MessageActionRowComponentBuilder,
} from 'discord.js';
import { selectMenu } from '../utils/embeds';
import { appendSelectNavigation } from '../utils/navigationComponents';
import {
  toOwnedEquipmentSelectOption,
  type OwnedEquipmentSelectRow,
} from './equipmentLabelSystem';

const RARITY_RANK: Record<string, number> = { UR: 70, SSR: 60, Uni: 55, Src: 50, SR: 30, R: 20, N: 10 };

export const OWNED_EQUIP_PAGE_SIZE = 24;

export function sortOwnedEquipmentByRarity(rows: OwnedEquipmentSelectRow[]): OwnedEquipmentSelectRow[] {
  return [...rows].sort((a, b) => {
    const dr = (RARITY_RANK[b.rarity] ?? 0) - (RARITY_RANK[a.rarity] ?? 0);
    if (dr !== 0) return dr;
    const up = (b.upgrade_level ?? 0) - (a.upgrade_level ?? 0);
    if (up !== 0) return up;
    return a.name.localeCompare(b.name, 'ja');
  });
}

export function buildPagedOwnedEquipmentSelectView(opts: {
  rows: OwnedEquipmentSelectRow[];
  page?: number;
  selectMenuId: string;
  selectLabel: string;
  pageButtonPrefix: string;
  backContext: string;
  backPayload: string;
  embedTitle?: string;
  embedBody?: string;
  extraComponentRows?: ActionRowBuilder<MessageActionRowComponentBuilder>[];
  navTag?: string;
}): {
  embedText: string;
  components: ActionRowBuilder<MessageActionRowComponentBuilder>[];
  page: number;
  totalPages: number;
} {
  const sorted = sortOwnedEquipmentByRarity(opts.rows);
  const totalPages = Math.max(1, Math.ceil(sorted.length / OWNED_EQUIP_PAGE_SIZE));
  const page = Math.min(Math.max(0, opts.page ?? 0), totalPages - 1);
  const pageRows = sorted.slice(page * OWNED_EQUIP_PAGE_SIZE, (page + 1) * OWNED_EQUIP_PAGE_SIZE);
  const options = pageRows.map((r) => toOwnedEquipmentSelectOption(r));

  const embedText = totalPages > 1
    ? `${opts.embedBody ?? '装備を選んでください'} (${page + 1}/${totalPages}ページ・${sorted.length}件・高レア優先)`
    : (opts.embedBody ?? '装備を選んでください');

  const components: ActionRowBuilder<MessageActionRowComponentBuilder>[] = [];
  if (opts.extraComponentRows?.length) components.push(...opts.extraComponentRows);
  if (options.length) {
    components.push(selectMenu(opts.selectMenuId, opts.selectLabel, options));
  }

  if (totalPages > 1) {
    const nav = new ActionRowBuilder<ButtonBuilder>();
    if (page > 0) {
      nav.addComponents(
        new ButtonBuilder()
          .setCustomId(`${opts.pageButtonPrefix}:${page - 1}`)
          .setLabel('◀ 前')
          .setStyle(ButtonStyle.Secondary),
      );
    }
    if (page < totalPages - 1) {
      nav.addComponents(
        new ButtonBuilder()
          .setCustomId(`${opts.pageButtonPrefix}:${page + 1}`)
          .setLabel('次 ▶')
          .setStyle(ButtonStyle.Secondary),
      );
    }
    if (nav.components.length) components.push(nav);
  }

  return {
    embedText,
    components: appendSelectNavigation(components, opts.backContext, opts.backPayload, opts.navTag ?? 'equip-menu'),
    page,
    totalPages,
  };
}

export function buildPagedCatalogSelectView(opts: {
  items: Array<{ id: string; label: string; description?: string }>;
  page?: number;
  selectMenuId: string;
  selectLabel: string;
  pageButtonPrefix: string;
  backContext: string;
  backPayload: string;
  embedBody?: string;
  navTag?: string;
}): {
  embedText: string;
  components: ActionRowBuilder<MessageActionRowComponentBuilder>[];
  page: number;
  totalPages: number;
} {
  const sorted = [...opts.items].sort((a, b) => a.label.localeCompare(b.label, 'ja'));
  const totalPages = Math.max(1, Math.ceil(sorted.length / OWNED_EQUIP_PAGE_SIZE));
  const page = Math.min(Math.max(0, opts.page ?? 0), totalPages - 1);
  const pageItems = sorted.slice(page * OWNED_EQUIP_PAGE_SIZE, (page + 1) * OWNED_EQUIP_PAGE_SIZE);
  const options = pageItems.map((i) => ({
    label: i.label.slice(0, 100),
    value: i.id,
    description: (i.description ?? '').slice(0, 100),
  }));

  const embedText = totalPages > 1
    ? `${opts.embedBody ?? '選択してください'} (${page + 1}/${totalPages}ページ・${sorted.length}件)`
    : (opts.embedBody ?? '選択してください');

  const components: ActionRowBuilder<MessageActionRowComponentBuilder>[] = [];
  if (options.length) {
    components.push(selectMenu(opts.selectMenuId, opts.selectLabel, options));
  }

  if (totalPages > 1) {
    const nav = new ActionRowBuilder<ButtonBuilder>();
    if (page > 0) {
      nav.addComponents(
        new ButtonBuilder().setCustomId(`${opts.pageButtonPrefix}:${page - 1}`).setLabel('◀ 前').setStyle(ButtonStyle.Secondary),
      );
    }
    if (page < totalPages - 1) {
      nav.addComponents(
        new ButtonBuilder().setCustomId(`${opts.pageButtonPrefix}:${page + 1}`).setLabel('次 ▶').setStyle(ButtonStyle.Secondary),
      );
    }
    if (nav.components.length) components.push(nav);
  }

  return {
    embedText,
    components: appendSelectNavigation(components, opts.backContext, opts.backPayload, opts.navTag ?? 'catalog'),
    page,
    totalPages,
  };
}
