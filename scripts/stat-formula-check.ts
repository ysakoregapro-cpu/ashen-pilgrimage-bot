/** stat-formula-check — npx tsx scripts/stat-formula-check.ts */
import { getDb } from '../src/db/database';
import { ensurePhase2Seed } from '../src/db/seedData/phase2Seed';
import { ensureMaterialsSeed } from '../src/db/seedData/materials';
import { baseMaxMpFromLevel, scaledJobMpMod } from '../src/systems/combatMp';
import { writeReport, mdTable } from './audit/reportWriter';
import { computeBaseStatsFromLevel, applyJobStatMultipliers } from '../src/db/seedData/jobMultiplierMaster';

const BASIC_JOBS = ['剣士', '重騎士', '狩人', '魔術師', '祈祷師', '斥候', '機工師', '格闘士', '巡礼者'] as const;
const LEVELS = [1, 20, 50, 70, 80, 100];

function baseStats(level: number) {
  return computeBaseStatsFromLevel(level);
}

function currentJobMods(db: ReturnType<typeof getDb>, jobName: string) {
  return db.prepare('SELECT * FROM jobs WHERE name=?').get(jobName) as {
    hp_mod: number; mp_mod: number; attack_mod: number; magic_mod: number;
    defense_mod: number; spirit_mod: number; speed_mod: number;
  } | undefined;
}

function calcCurrent(mainJob: string, subJob: string | null, level: number, db: ReturnType<typeof getDb>) {
  const b = baseStats(level);
  const main = currentJobMods(db, mainJob);
  if (main) {
    b.max_hp += main.hp_mod;
    b.max_mp += scaledJobMpMod(main.mp_mod, level);
    b.attack += main.attack_mod;
    b.magic += main.magic_mod;
    b.defense += main.defense_mod;
    b.spirit += main.spirit_mod;
    b.speed += main.speed_mod;
  }
  if (subJob) {
    const sub = currentJobMods(db, subJob);
    if (sub) {
      const r = 0.4;
      b.max_hp += Math.floor(sub.hp_mod * r);
      b.max_mp += Math.floor(scaledJobMpMod(sub.mp_mod, level) * r);
      b.attack += Math.floor(sub.attack_mod * r);
      b.magic += Math.floor(sub.magic_mod * r);
      b.defense += Math.floor(sub.defense_mod * r);
      b.spirit += Math.floor(sub.spirit_mod * r);
      b.speed += Math.floor(sub.speed_mod * r);
    }
  }
  return b;
}

function calcPhase2(mainJob: string, subJob: string | null, level: number) {
  const b = computeBaseStatsFromLevel(level);
  applyJobStatMultipliers(b, mainJob, subJob);
  return b;
}

function main() {
  ensureMaterialsSeed(getDb());
  ensurePhase2Seed(getDb());
  const db = getDb();

  const lines: string[] = [
    '# Stat Formula Check',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    '## Current formula (recalculatePlayerStats)',
    '- Base: HP 100+(Lv-1)*15, ATK/MAG 10+(Lv-1)*2, DEF/SPI/SPD 8+(Lv-1)*1',
    '- MP: baseMaxMpFromLevel + scaledJobMpMod(main) + floor(sub*0.4)',
    '- Job: **multiplier** via jobMultiplierMaster (Phase2 implemented)',
    '- Sub: multiplier stacked on base',
    '- Equipment + set % applied after',
    '',
  ];

  for (const job of ['剣士', '魔術師', '重騎士'] as const) {
    const rows: string[][] = [];
    for (const lv of LEVELS) {
      const cur = calcCurrent(job, null, lv, db);
      rows.push([String(lv), String(cur.attack), String(cur.magic), String(cur.defense), String(cur.max_hp), String(cur.max_mp)]);
    }
    lines.push(`### Current — ${job} (main only)`);
    lines.push(mdTable(['Lv', 'ATK', 'MAG', 'DEF', 'HP', 'MP'], rows));
    lines.push('');
  }

  lines.push('## Phase2 implemented (jobMultiplierMaster, equipment excluded)');
  lines.push('Formula: floor(base × main × sub) — 巡礼者/繋ぎ手 example with 魔術師+灰術士');
  const p2rows: string[][] = [];
  for (const lv of LEVELS) {
    const s = calcPhase2('魔術師', '灰術士', lv);
    p2rows.push([String(lv), String(s.attack), String(s.magic), String(s.defense), String(s.max_hp), String(s.max_mp)]);
  }
  lines.push(mdTable(['Lv', 'ATK', 'MAG', 'DEF', 'HP', 'MP'], p2rows));

  writeReport('stat-formula-check.md', lines.join('\n'));
  console.log('✅ stat-formula-check → reports/stat-formula-check.md');
}

main();
