import {
  ActionRowBuilder,
  ButtonBuilder,
  ComponentType,
  StringSelectMenuBuilder,
  type MessageActionRowComponentBuilder,
} from 'discord.js';

export type CustomIdLocation = { customId: string; rowIndex: number; colIndex: number };

export function collectComponentCustomIds(
  components: ActionRowBuilder<MessageActionRowComponentBuilder>[],
): CustomIdLocation[] {
  const out: CustomIdLocation[] = [];
  components.forEach((row, rowIndex) => {
    const json = row.toJSON();
    json.components.forEach((c, colIndex) => {
      if ('custom_id' in c && c.custom_id) {
        out.push({ customId: c.custom_id, rowIndex, colIndex });
      }
    });
  });
  return out;
}

export function findDuplicateCustomIds(
  components: ActionRowBuilder<MessageActionRowComponentBuilder>[],
): Map<string, CustomIdLocation[]> {
  const byId = new Map<string, CustomIdLocation[]>();
  for (const loc of collectComponentCustomIds(components)) {
    const list = byId.get(loc.customId) ?? [];
    list.push(loc);
    byId.set(loc.customId, list);
  }
  const dupes = new Map<string, CustomIdLocation[]>();
  for (const [id, locs] of byId) {
    if (locs.length > 1) dupes.set(id, locs);
  }
  return dupes;
}

export function warnDuplicateCustomIds(
  components: ActionRowBuilder<MessageActionRowComponentBuilder>[],
  context?: string,
): void {
  const dupes = findDuplicateCustomIds(components);
  if (!dupes.size) return;
  const prefix = context ? `[components${context ? `: ${context}` : ''}]` : '[components]';
  for (const [customId, locs] of dupes) {
    const where = locs.map((l) => `row ${l.rowIndex} col ${l.colIndex}`).join(', ');
    console.warn(`${prefix} duplicate custom_id "${customId}" at ${where}`);
  }
}

/** 同一メッセージ内の custom_id 重複を除去（先勝ち） */
export function sanitizeComponents(
  components: ActionRowBuilder<MessageActionRowComponentBuilder>[],
  context?: string,
): ActionRowBuilder<MessageActionRowComponentBuilder>[] {
  warnDuplicateCustomIds(components, context);
  const seen = new Set<string>();
  const sanitized: ActionRowBuilder<MessageActionRowComponentBuilder>[] = [];

  for (const row of components) {
    const next = new ActionRowBuilder<MessageActionRowComponentBuilder>();
    for (const component of row.components) {
      if (component instanceof ButtonBuilder) {
        const json = component.toJSON();
        const id = 'custom_id' in json ? json.custom_id : undefined;
        if (id) {
          if (seen.has(id)) continue;
          seen.add(id);
        }
        next.addComponents(ButtonBuilder.from(json));
      } else if (component instanceof StringSelectMenuBuilder) {
        const json = component.toJSON();
        const id = json.custom_id;
        if (id) {
          if (seen.has(id)) continue;
          seen.add(id);
        }
        next.addComponents(StringSelectMenuBuilder.from(json));
      }
    }
    if (next.components.length) sanitized.push(next);
  }

  return sanitized;
}

export type SelectMenuIssue = { customId: string; rowIndex: number; optionCount: number; kind: 'empty' | 'overflow' };

export function findSelectMenuIssues(
  components: ActionRowBuilder<MessageActionRowComponentBuilder>[],
): SelectMenuIssue[] {
  const issues: SelectMenuIssue[] = [];
  components.forEach((row, rowIndex) => {
    const json = row.toJSON();
    for (const c of json.components) {
      if (c.type !== ComponentType.StringSelect) continue;
      const count = c.options?.length ?? 0;
      if (count === 0) issues.push({ customId: c.custom_id, rowIndex, optionCount: count, kind: 'empty' });
      else if (count > 25) issues.push({ customId: c.custom_id, rowIndex, optionCount: count, kind: 'overflow' });
    }
  });
  return issues;
}
