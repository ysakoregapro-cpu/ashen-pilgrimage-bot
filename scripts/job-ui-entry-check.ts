/** job-ui-entry-check — npx tsx scripts/job-ui-entry-check.ts */
import fs from 'fs';
import path from 'path';
import { getDb } from '../src/db/database';
import { ensurePhase2Seed } from '../src/db/seedData/phase2Seed';
import { ensureMaterialsSeed } from '../src/db/seedData/materials';
import { createPlayer } from '../src/systems/playerSystem';
import { SUB_JOB_UNLOCK_LEVEL } from '../src/db/seedData/jobProgressionMaster';
import { LEGACY_ADVANCED_JOBS, LEGACY_HIDDEN_JOBS, PHASE2_SUB_JOBS } from '../src/db/seedData/jobMultiplierMaster';
import {
  buildJobMenuView,
  buildMainJobSelectView,
  buildSubJobSelectView,
  collectSelectMenuOptionCounts,
  collectSelectMenuValues,
} from '../src/systems/jobUiSystem';
import { findDuplicateCustomIds } from '../src/utils/componentSafety';
import { writeReport } from './audit/reportWriter';

const TEST_USER = 'job-ui-entry-check-user';
const FAC_ID = 'fac_reception';

function resetUser(db: ReturnType<typeof getDb>) {
  db.prepare('DELETE FROM player_sub_job_unlocks WHERE user_id = ?').run(TEST_USER);
  db.prepare('DELETE FROM player_job_levels WHERE user_id = ?').run(TEST_USER);
  db.prepare('DELETE FROM players WHERE user_id = ?').run(TEST_USER);
}

function assertSelectMenus(payload: ReturnType<typeof buildJobMenuView>, label: string, issues: string[]) {
  const counts = collectSelectMenuOptionCounts(payload);
  for (const n of counts) {
    if (n < 1 || n > 25) issues.push(`${label}: select options=${n} (must be 1-25)`);
  }
  const dupes = findDuplicateCustomIds(payload.components);
  if (dupes.size) issues.push(`${label}: duplicate custom_id ${[...dupes.keys()].join(', ')}`);
  if (payload.components.length > 5) issues.push(`${label}: ${payload.components.length} component rows > 5`);
}

function assertNoLegacyInSelect(payload: ReturnType<typeof buildMainJobSelectView>, label: string, issues: string[]) {
  const values = collectSelectMenuValues(payload);
  for (const v of values) {
    if (LEGACY_ADVANCED_JOBS.has(v) || LEGACY_HIDDEN_JOBS.has(v)) {
      issues.push(`${label}: legacy job in select menu: ${v}`);
    }
  }
}

function main() {
  const db = getDb();
  ensureMaterialsSeed(db);
  ensurePhase2Seed(db);
  resetUser(db);
  createPlayer(TEST_USER, 'g', 'JobUiTest', 'ch');

  const issues: string[] = [];
  const uxHandler = fs.readFileSync(path.join(process.cwd(), 'src/interactions/uxHandler.ts'), 'utf8');

  if (uxHandler.includes('getJobSelectOptions')) {
    issues.push('uxHandler still references getJobSelectOptions');
  }
  if (!uxHandler.includes('buildJobMenuView')) {
    issues.push('uxHandler does not use buildJobMenuView for job_select');
  }

  // 1. Reception-equivalent: facility job menu
  const facilityMenu = buildJobMenuView(TEST_USER, { facilityId: FAC_ID });
  assertSelectMenus(facilityMenu, 'facility menu', issues);
  const backBtn = facilityMenu.components.flatMap((r) => r.toJSON().components)
    .find((c) => 'custom_id' in c && c.custom_id === `job:back:facility:${FAC_ID}`);
  if (!backBtn) issues.push('facility menu missing job:back:facility button');

  // 2. Initial / JobLv0 — main job select must have 9 basic options
  db.prepare("UPDATE players SET main_job = '未選択', sub_job = NULL WHERE user_id = ?").run(TEST_USER);
  const mainFresh = buildMainJobSelectView(TEST_USER);
  const mainCounts = collectSelectMenuOptionCounts(mainFresh);
  if (!mainCounts.length || mainCounts[0]! < 9) {
    issues.push(`fresh main select options=${mainCounts[0] ?? 0} (expected >=9)`);
  }
  assertNoLegacyInSelect(mainFresh, 'fresh main', issues);

  // 3. Sub locked — no select menu, explanation only
  db.prepare("UPDATE players SET main_job = '剣士', sub_job = NULL WHERE user_id = ?").run(TEST_USER);
  const subLocked = buildSubJobSelectView(TEST_USER);
  const subLockedCounts = collectSelectMenuOptionCounts(subLocked);
  if (subLockedCounts.length > 0) {
    issues.push(`sub locked state has select menu (${subLockedCounts.join(',')} options)`);
  }
  const subEmbed = subLocked.embeds[0]?.data.description ?? '';
  if (!subEmbed.includes('まだ選択できるサブジョブはありません')) {
    issues.push('sub locked embed missing empty-state message');
  }
  if (!subLocked.components.some((r) => r.toJSON().components.some((c) => 'custom_id' in c && c.custom_id === 'job:menu'))) {
    issues.push('sub locked view missing back button');
  }

  // 4. Sub unlocked — select with Phase2 subs only
  db.prepare(`
    INSERT INTO player_job_levels (user_id, job_name, job_level, job_exp, is_main, is_sub, unlocked_at, updated_at)
    VALUES (?, '剣士', ?, 0, 1, 0, datetime('now'), datetime('now'))
  `).run(TEST_USER, SUB_JOB_UNLOCK_LEVEL);
  db.prepare(`
    INSERT OR IGNORE INTO player_sub_job_unlocks (user_id, sub_job, unlocked_at, unlock_source)
    VALUES (?, '刃走り', datetime('now'), 'test')
  `).run(TEST_USER);
  const subOpen = buildSubJobSelectView(TEST_USER);
  const subValues = collectSelectMenuValues(subOpen);
  if (!subValues.includes('刃走り')) issues.push('unlocked 刃走り not in sub select');
  for (const v of subValues) {
    if (!PHASE2_SUB_JOBS.includes(v)) issues.push(`non-Phase2 sub in select: ${v}`);
  }

  // 5. /job show menu
  const showMenu = buildJobMenuView(TEST_USER);
  assertSelectMenus(showMenu, '/job show menu', issues);
  const showJson = showMenu.components.flatMap((r) => r.toJSON().components);
  if (!showJson.some((c) => 'custom_id' in c && c.custom_id === 'job:main')) {
    issues.push('/job show missing job:main button');
  }
  if (!showJson.some((c) => 'custom_id' in c && c.custom_id === 'job:trial:list')) {
    issues.push('/job show missing trial button');
  }

  // 6. Legacy equipped — warning text, no legacy in select
  db.prepare("UPDATE players SET main_job = '剣豪', sub_job = '剣豪' WHERE user_id = ?").run(TEST_USER);
  const legacyMenu = buildJobMenuView(TEST_USER);
  const legacyDesc = legacyMenu.embeds[0]?.data.description ?? '';
  if (!legacyDesc.includes('旧職')) issues.push('legacy equipped menu missing 旧職 warning');
  const legacyMain = buildMainJobSelectView(TEST_USER);
  assertNoLegacyInSelect(legacyMain, 'legacy main select', issues);

  const lines = [
    '# Job UI Entry Check',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    `- facility menu uses buildJobMenuView: ${uxHandler.includes('buildJobMenuView') ? 'OK' : 'FAIL'}`,
    `- fresh main options: ${mainCounts[0] ?? 0}`,
    `- sub locked select menus: ${subLockedCounts.length}`,
    `- sub unlocked values: ${subValues.join(', ') || '(none)'}`,
    '',
    '## Summary',
    issues.length ? `FAIL (${issues.length})` : 'PASS',
  ];
  if (issues.length) {
    lines.push('', '### Issues');
    for (const i of issues) lines.push(`- ${i}`);
  }

  writeReport('job-ui-entry-check.md', lines.join('\n'));
  if (issues.length) {
    console.error(`FAIL: ${issues.length} issue(s)`);
    for (const i of issues) console.error(`- ${i}`);
    process.exit(1);
  }
  console.log('PASS');
}

main();
