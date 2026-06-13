/** feature-completeness-audit — npx tsx scripts/feature-completeness-audit.ts */
import { readFileSync, readdirSync, statSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

type Entry = { id: string; category: string; classification: string; notes: string };

const ROOT = join(process.cwd(), 'src');
const reportsDir = join(process.cwd(), 'reports');
const entries: Entry[] = [];

function walk(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (!name.includes('node_modules')) walk(p, acc);
    } else if (/\.(ts|tsx)$/.test(name)) acc.push(p);
  }
  return acc;
}

function read(path: string): string {
  try { return readFileSync(path, 'utf8'); } catch { return ''; }
}

function add(id: string, category: string, classification: string, notes: string) {
  entries.push({ id, category, classification, notes });
}

function main() {
  const files = walk(ROOT);
  const indexSrc = read(join(ROOT, 'index.ts'));
  const allSrc = files.map((f) => read(f)).join('\n');

  const slashNames = [...indexSrc.matchAll(/\.setName\(['"]([^'"]+)['"]\)/g)].map((m) => m[1]!);
  for (const name of new Set(slashNames)) {
    add(`/${name}`, 'slash_command', 'implemented_and_reachable', 'Registered in commands');
  }

  const buttonIds = new Set<string>();
  for (const src of files) {
    for (const m of src.matchAll(/setCustomId\(\s*[`'"]([^`'"]+)[`'"]/g)) {
      buttonIds.add(m[1]!);
    }
    for (const m of src.matchAll(/setCustomId\(\s*`([^`$]+)/g)) {
      buttonIds.add(m[1]!.split(':')[0] + ':*');
    }
  }

  const handlerRoots = new Set<string>();
  for (const m of indexSrc.matchAll(/if \(parts\[0\] === ['"]([^'"]+)['"]\)/g)) handlerRoots.add(m[1]!);

  for (const id of buttonIds) {
    const root = id.split(':')[0]!;
    const hasHandler = handlerRoots.has(root) || indexSrc.includes(`parts[0] === '${root}'`);
    add(id, 'button', hasHandler ? 'implemented_and_reachable' : 'ui_without_handler', hasHandler ? '' : 'No index.ts parts[0] branch');
  }

  for (const root of handlerRoots) {
    const hasUi = [...buttonIds].some((id) => id.startsWith(`${root}:`)) || allSrc.includes(`'${root}:'`);
    if (!hasUi && !['battle', 'flow', 'nav'].includes(root)) {
      add(`${root}:*`, 'handler', 'handler_without_ui', 'Handler branch without obvious UI custom_id');
    }
  }

  if (allSrc.includes('coop:join:') && allSrc.includes('forPublicChannel')) {
    add('coop:join', 'coop/rescue/raid', 'implemented_and_reachable', 'Public channel join fix applied');
  } else {
    add('coop:join', 'coop/rescue/raid', 'disabled_unexpectedly', 'Check forPublicChannel join button state');
  }

  for (const legacy of ['rescue:join', 'raid:join']) {
    add(legacy, 'legacy', indexSrc.includes(`parts[0] === '${legacy.split(':')[0]}'`) ? 'legacy_leftover' : 'implemented_but_unreachable', 'Legacy path — coop:join preferred');
  }

  const areas = ['valhalla', 'trial', 'upgrade', 'repair', 'awaken', 'kai', 'shop', 'explore', 'equip', 'inventory'];
  for (const area of areas) {
    const hits = files.filter((f) => read(f).includes(area));
    if (hits.length) add(area, 'feature_area', 'needs_manual_test', `${hits.length} files reference — manual playtest recommended`);
  }

  mkdirSync(reportsDir, { recursive: true });
  const md = [
    '# Feature Completeness Audit',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    `| id | category | classification | notes |`,
    `|---|---|---|---|`,
    ...entries.map((e) => `| ${e.id} | ${e.category} | ${e.classification} | ${e.notes.replace(/\|/g, '/')} |`),
    '',
    '## Summary',
    `- Total entries: ${entries.length}`,
    `- ui_without_handler: ${entries.filter((e) => e.classification === 'ui_without_handler').length}`,
    `- handler_without_ui: ${entries.filter((e) => e.classification === 'handler_without_ui').length}`,
    `- legacy_leftover: ${entries.filter((e) => e.classification === 'legacy_leftover').length}`,
  ].join('\n');

  writeFileSync(join(reportsDir, 'feature-completeness-audit.md'), md, 'utf8');

  const uiMissing = entries.filter((e) => e.classification === 'ui_without_handler');
  console.log(`✅ feature-completeness-audit → ${entries.length} entries, ui_without_handler=${uiMissing.length}`);
  if (uiMissing.length > 20) {
    console.log('WARN: many dynamic custom_ids flagged — review reports/feature-completeness-audit.md');
  }
}

main();
