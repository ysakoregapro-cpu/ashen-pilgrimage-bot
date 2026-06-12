/** job-stat-design-audit — npx tsx scripts/job-stat-design-audit.ts */
import { writeFileSync } from 'fs';
import { join } from 'path';
import {
  MAIN_JOB_MULTS, SUB_JOB_MULTS, ADVANCED_MAIN_JOB_MULTS,
  computeBaseStatsFromLevel, applyJobStatMultipliers,
} from '../src/db/seedData/jobMultiplierMaster';
import { writeReport, mdTable } from './audit/reportWriter';

const LEVELS = [1, 5, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
const JOB_LEVELS = [1, 20, 50, 70, 80, 100];
const BASIC_JOBS = ['剣士', '重騎士', '狩人', '魔術師', '祈祷師', '斥候', '機工師', '格闘士', '巡礼者'];

function baseRow(level: number) {
  const b = computeBaseStatsFromLevel(level);
  return {
    level,
    base_max_hp: b.max_hp,
    base_max_mp: b.max_mp,
    base_attack: b.attack,
    base_magic: b.magic,
    base_defense: b.defense,
    base_speed: b.speed,
  };
}

function jobStats(mainJob: string, subJob: string | null, level: number) {
  const b = computeBaseStatsFromLevel(level);
  applyJobStatMultipliers(b, mainJob, subJob);
  return {
    level,
    max_hp: b.max_hp,
    max_mp: b.max_mp,
    attack: b.attack,
    magic: b.magic,
    defense: b.defense,
    speed: b.speed,
  };
}

const allBase = Array.from({ length: 100 }, (_, i) => baseRow(i + 1));
const sampleBase = LEVELS.map(baseRow);

const jobRows: Array<Record<string, string | number>> = [];
for (const job of BASIC_JOBS) {
  const sub = job === '巡礼者' ? '繋ぎ手' : Object.entries(SUB_JOB_MULTS).find(([k]) => k.includes(job.slice(0, 1)))?.[0] ?? null;
  const pairedSub = {
    '剣士': '刃走り', '重騎士': '城壁番', '狩人': '矢痕読み', '魔術師': '灰術士',
    '祈祷師': '灯守', '斥候': '影足', '機工師': '歯車工', '格闘士': '勁打者', '巡礼者': '繋ぎ手',
  }[job] ?? null;
  for (const lv of JOB_LEVELS) {
    const s = jobStats(job, pairedSub, lv);
    jobRows.push({ job, sub: pairedSub ?? '—', ...s });
  }
}

const warns: string[] = [];
for (const job of BASIC_JOBS) {
  const s70 = jobStats(job, null, 70);
  if (s70.max_hp < 900 && ['魔術師', '祈祷師'].includes(job)) {
    warns.push(`Lv70 ${job} HP=${s70.max_hp} — 低耐久（想定内WARN）`);
  }
}
for (const [adv, mult] of Object.entries(ADVANCED_MAIN_JOB_MULTS)) {
  if (mult.attack > 1.7 || mult.speed > 1.8) {
    warns.push(`上級職 ${adv} 倍率が高め attack=${mult.attack} speed=${mult.speed}`);
  }
}

const csvAll = ['level,base_max_hp,base_max_mp,base_attack,base_magic,base_defense,base_speed',
  ...allBase.map((r) => `${r.level},${r.base_max_hp},${r.base_max_mp},${r.base_attack},${r.base_magic},${r.base_defense},${r.base_speed}`),
].join('\n');
writeFileSync(join(process.cwd(), 'reports', 'job-stat-design-audit.csv'), csvAll, 'utf8');

const md = [
  '# Job Stat Design Audit (Phase2)',
  '',
  '## Base stats (sample levels)',
  mdTable(
    ['level', 'base_max_hp', 'base_max_mp', 'base_attack', 'base_magic', 'base_defense', 'base_speed'],
    sampleBase.map((r) => [String(r.level), String(r.base_max_hp), String(r.base_max_mp), String(r.base_attack), String(r.base_magic), String(r.base_defense), String(r.base_speed)]),
  ),
  '',
  '## Job-adjusted (basic + paired sub, no equipment)',
  mdTable(
    ['job', 'sub', 'level', 'max_hp', 'max_mp', 'attack', 'magic', 'defense', 'speed'],
    jobRows.slice(0, 40).map((r) => [String(r.job), String(r.sub), String(r.level), String(r.max_hp), String(r.max_mp), String(r.attack), String(r.magic), String(r.defense), String(r.speed)]),
  ),
  '',
  '## Multiplier source',
  '- MAIN_JOB_MULTS / SUB_JOB_MULTS / ADVANCED_MAIN_JOB_MULTS in jobMultiplierMaster.ts',
  '',
  '## WARN',
  ...warns.map((w) => `- ${w}`),
].join('\n');

writeReport('job-stat-design-audit.md', md);
console.log('job-stat-design-audit: OK');
if (warns.length) console.log('WARN:', warns.length);
