/** phase2-final-sanity-check — npx tsx scripts/phase2-final-sanity-check.ts */
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { getDb } from '../src/db/database';
import { writeReport } from './audit/reportWriter';
import {
  runPhase21AcquisitionFailures,
  logPhase21Stats,
} from './audit/phase21Checks';

const REQUIRED_FILES = [
  'src/systems/jobUiSystem.ts',
  'src/systems/trialBattleSystem.ts',
  'src/systems/jobProgressionSystem.ts',
  'src/systems/inventoryUseSystem.ts',
  'src/systems/kaiForgeSystem.ts',
  'src/db/seedData/ensurePhase2EquipmentRoutes.ts',
  'src/db/seedData/jobMultiplierMaster.ts',
  'src/db/seedData/equipmentClassification.ts',
  'src/systems/equipmentAcquisitionAudit.ts',
  'scripts/advanced-trial-flow-check.ts',
  'scripts/enemy-balance-design-audit.ts',
  'scripts/job-sub-ui-check.ts',
  'scripts/job-ui-entry-check.ts',
  'scripts/equipment-completion-audit.ts',
];

const CODE_CHECKS: Array<{ label: string; file: string; pattern: RegExp }> = [
  { label: 'trial UI buttons', file: 'src/systems/jobUiSystem.ts', pattern: /job:trial:start/ },
  { label: 'inv:use handler', file: 'src/index.ts', pattern: /parts\[0\] === 'inv'/ },
  { label: 'consumable out-of-battle', file: 'src/systems/inventoryUseSystem.ts', pattern: /useConsumableOutOfBattle/ },
  { label: 'acquisition hint', file: 'src/systems/itemDetailSystem.ts', pattern: /formatAcquisitionSourceHint/ },
  { label: 'buildAcquisitionHintLines', file: 'src/systems/itemDetailSystem.ts', pattern: /buildAcquisitionHintLines/ },
  { label: 'legacy display', file: 'src/systems/itemDetailSystem.ts', pattern: /現在通常入手不可/ },
  { label: 'Src echo x3', file: 'src/db/seedData/forgeMaster.ts', pattern: /SRC_FORGE_ECHO_QTY = 3/ },
  { label: 'arms drop weight', file: 'src/systems/equipmentDropSystem.ts', pattern: /arms:\s*\d+/ },
  { label: 'phase2 sub UI', file: 'src/systems/jobUiSystem.ts', pattern: /getSelectableSubJobs/ },
  { label: 'job UI entry', file: 'src/interactions/uxHandler.ts', pattern: /buildJobMenuView/ },
  { label: 'safe select menu', file: 'src/systems/jobUiSystem.ts', pattern: /safeSelectMenu/ },
  { label: 'Uni material drops', file: 'src/db/seedData/jobProgressionMaster.ts', pattern: /PHASE2_UNI_MATERIAL_DROPS/ },
  { label: 'sanitizeComponents', file: 'src/utils/messageFlow.ts', pattern: /sanitizeComponents/ },
];

function gitStatusShort(): string {
  try {
    return execSync('git status --short', { encoding: 'utf8', cwd: process.cwd() });
  } catch {
    return '';
  }
}

function main() {
  const issues: string[] = [];
  const lines: string[] = [
    '# Phase2 Final Sanity Check',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
  ];

  for (const f of REQUIRED_FILES) {
    if (!fs.existsSync(path.join(process.cwd(), f))) issues.push(`Missing file: ${f}`);
  }
  lines.push('## Required files', ...REQUIRED_FILES.map((f) => `- ${fs.existsSync(f) ? '✓' : '✗'} ${f}`));

  for (const c of CODE_CHECKS) {
    const p = path.join(process.cwd(), c.file);
    if (!fs.existsSync(p)) {
      issues.push(`Missing ${c.file} for ${c.label}`);
      continue;
    }
    const src = fs.readFileSync(p, 'utf8');
    if (!c.pattern.test(src)) issues.push(`Pattern missing (${c.label}): ${c.file}`);
    lines.push(`- ${c.label}: ${c.pattern.test(src) ? 'OK' : 'FAIL'}`);
  }

  const status = gitStatusShort();
  const dangerous = /data\/database|database\.sqlite|node_modules|dist|\.env/.test(status);
  if (dangerous) issues.push('Dangerous files in git status');
  lines.push('', '## Dangerous file check', dangerous ? 'FAIL — see git status' : 'PASS — no matches');

  const jobData = fs.readFileSync(path.join(process.cwd(), 'src/commands/job.ts'), 'utf8');
  if (jobData.includes("getJobs('advanced')")) issues.push('/job sub still uses legacy advanced tier');
  lines.push('', '## Slash command deploy', 'No SlashCommandBuilder changes required (button-only additions)');

  const db = getDb();
  const trialCols = (db.prepare('PRAGMA table_info(battle_sessions)').all() as Array<{ name: string }>)
    .some((c) => c.name === 'trial_type');
  if (!trialCols) issues.push('battle_sessions.trial_type missing');
  lines.push('', '## DB trial columns', trialCols ? 'OK' : 'FAIL');

  logPhase21Stats();
  issues.push(...runPhase21AcquisitionFailures());
  lines.push('', '## Phase2.1 equipment completion', issues.filter((i) => i.includes('入手') || i.includes('unknown') || i.includes('セット')).length ? 'see issues' : 'OK');

  lines.push('', '## Summary', issues.length ? `FAIL (${issues.length})` : 'PASS');
  if (issues.length) {
    lines.push('', '### Issues');
    for (const i of issues) lines.push(`- ${i}`);
  }

  writeReport('phase2-final-sanity-check.md', lines.join('\n'));
  if (issues.length) {
    console.error(`FAIL: ${issues.length} issue(s)`);
    for (const i of issues.slice(0, 25)) console.error('  -', i);
    process.exit(1);
  }
  console.log('PASS');
}

main();
