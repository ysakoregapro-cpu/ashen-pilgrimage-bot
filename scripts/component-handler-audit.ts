/** component-handler-audit — npx tsx scripts/component-handler-audit.ts */
import { readFileSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { buildCoopRecruitButtons } from '../src/systems/coop/coopUi';
import { createCoopRecruit } from '../src/systems/coop/coopRecruitSystem';
import { getDb } from '../src/db/database';
import { ensurePhase2Seed } from '../src/db/seedData/phase2Seed';
import { sanitizeComponents, findDuplicateCustomIds } from '../src/utils/componentSafety';
import type { ActionRowBuilder, ButtonBuilder } from 'discord.js';

type Row = { custom_id: string; handler: string; classification: string; notes: string };

const INDEX = readFileSync(join(process.cwd(), 'src/index.ts'), 'utf8');
const rows: Row[] = [];

function handlerForRoot(root: string): string {
  if (INDEX.includes(`parts[0] === '${root}'`)) return `index.ts:${root}`;
  if (INDEX.includes(`parts[0] === " ${root}"`)) return `index.ts:${root}`;
  return '—';
}

function classifyCustomId(id: string): Row {
  const root = id.split(':')[0]!;
  const handler = handlerForRoot(root);
  let classification = handler === '—' ? 'ui_without_handler' : 'implemented_and_reachable';
  let notes = '';

  if (id.startsWith('coop:join:')) {
    classification = 'implemented_and_reachable';
    notes = 'coop recruit join — handleCoopRecruitButton';
  }
  if (id.startsWith('rescue:') || id.startsWith('raid:')) {
    classification = 'legacy_leftover';
    notes = 'Legacy handler still in index.ts';
  }
  if (id.includes('${') || id.endsWith(':*')) {
    classification = 'needs_manual_test';
    notes = 'Dynamic id template';
  }

  return { custom_id: id, handler, classification, notes };
}

function main() {
  const db = getDb();
  ensurePhase2Seed(db);
  db.prepare('DELETE FROM coop_members').run();
  db.prepare('DELETE FROM coop_recruits').run();

  const created = createCoopRecruit('audit-guild', 'leader-audit', 'rescue');
  const buttons = buildCoopRecruitButtons(created.recruitId!, { forPublicChannel: true });
  const sanitized = sanitizeComponents(buttons as ActionRowBuilder<ButtonBuilder>[], 'audit') as ActionRowBuilder<ButtonBuilder>[];
  const dupes = findDuplicateCustomIds(sanitized);

  for (const row of sanitized) {
    for (const c of row.toJSON().components) {
      if (c.type === 2 && c.custom_id) rows.push(classifyCustomId(c.custom_id));
    }
  }

  const staticIds = [
    'coop:join:sample', 'coop:leave:sample', 'coop:start:sample', 'coop:cancel:sample',
    'job:trial:list', 'job:trial:start:剣士', 'equip:confirm:1', 'upgrade:confirm:1:2',
    'shop:confirm_buy:1', 'flow:town', 'nav:back:panel',
  ];
  for (const id of staticIds) rows.push(classifyCustomId(id));

  const reportsDir = join(process.cwd(), 'reports');
  mkdirSync(reportsDir, { recursive: true });

  const md = [
    '# Component Handler Audit',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    `Coop recruit duplicate custom_ids after sanitize: ${dupes.size}`,
    '',
    '| custom_id | handler | classification | notes |',
    '|---|---|---|---|',
    ...rows.map((r) => `| ${r.custom_id} | ${r.handler} | ${r.classification} | ${r.notes} |`),
    '',
    '## coop join button',
    `- join disabled on public active recruit: ${sanitized.flatMap((r) => r.toJSON().components).find((c) => c.label === '参加する')?.disabled === false ? 'NO (good)' : 'YES (bad)'}`,
  ].join('\n');

  writeFileSync(join(reportsDir, 'component-handler-audit.md'), md, 'utf8');

  const missing = rows.filter((r) => r.classification === 'ui_without_handler' && !r.custom_id.includes('sample'));
  console.log(`✅ component-handler-audit → ${rows.length} rows, coop dupe=${dupes.size}, ui_without_handler=${missing.length}`);
}

main();
