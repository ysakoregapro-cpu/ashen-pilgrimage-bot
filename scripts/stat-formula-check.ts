/** stat-formula-check — npx tsx scripts/stat-formula-check.ts */
import { getDb } from '../src/db/database';
import { ensurePhase2Seed } from '../src/db/seedData/phase2Seed';
import { ensureMaterialsSeed } from '../src/db/seedData/materials';
import { baseMaxMpFromLevel, scaledJobMpMod } from '../src/systems/combatMp';
import { writeReport, mdTable } from './audit/reportWriter';

const BASIC_JOBS = ['剣士', '重騎士', '狩人', '魔術師', '祈祷師', '斥候', '機工師', '格闘士', '巡礼者'] as const;
const LEVELS = [1, 20, 50, 70, 80, 100];

const MAIN_JOB_MULTS: Record<string, Record<string, number>> = {
  '剣士': { max_hp: 1.05, max_mp: 1.00, attack: 1.15, magic: 0.95, defense: 1.02, speed: 1.00 },
  '重騎士': { max_hp: 1.20, max_mp: 0.95, attack: 1.05, magic: 0.90, defense: 1.20, speed: 0.88 },
  '狩人': { max_hp: 1.00, max_mp: 1.00, attack: 1.10, magic: 0.95, defense: 0.98, speed: 1.08 },
  '魔術師': { max_hp: 0.90, max_mp: 1.18, attack: 0.85, magic: 1.22, defense: 0.92, speed: 1.00 },
  '祈祷師': { max_hp: 1.00, max_mp: 1.15, attack: 0.92, magic: 1.10, defense: 1.00, speed: 0.98 },
  '斥候': { max_hp: 0.95, max_mp: 1.00, attack: 1.05, magic: 0.95, defense: 0.92, speed: 1.18 },
  '機工師': { max_hp: 1.00, max_mp: 1.05, attack: 1.08, magic: 1.08, defense: 0.98, speed: 1.00 },
  '格闘士': { max_hp: 1.08, max_mp: 0.95, attack: 1.18, magic: 0.85, defense: 0.98, speed: 1.05 },
  '巡礼者': { max_hp: 1.00, max_mp: 1.00, attack: 1.00, magic: 1.00, defense: 1.00, speed: 1.00 },
};

const SUB_JOB_MULTS: Record<string, Record<string, number>> = {
  '刃走り': { max_hp: 1.00, max_mp: 1.00, attack: 1.08, magic: 0.98, defense: 0.98, speed: 1.10 },
  '灰術士': { max_hp: 0.96, max_mp: 1.06, attack: 0.95, magic: 1.10, defense: 0.96, speed: 1.00 },
  '繋ぎ手': { max_hp: 1.00, max_mp: 1.00, attack: 1.00, magic: 1.00, defense: 1.00, speed: 1.00 },
};

function baseStats(level: number) {
  return {
    max_hp: 100 + (level - 1) * 15,
    max_mp: baseMaxMpFromLevel(level),
    attack: 10 + (level - 1) * 2,
    magic: 10 + (level - 1) * 2,
    defense: 8 + (level - 1) * 1,
    spirit: 8 + (level - 1) * 1,
    speed: 10 + (level - 1) * 1,
  };
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
  const b = baseStats(level);
  const mm = MAIN_JOB_MULTS[mainJob] ?? MAIN_JOB_MULTS['巡礼者']!;
  const sm = subJob ? (SUB_JOB_MULTS[subJob] ?? SUB_JOB_MULTS['繋ぎ手']!) : null;
  const apply = (key: keyof typeof b, multKey: string) => {
    let v = b[key] * (mm[multKey] ?? 1);
    if (sm) v *= sm[multKey] ?? 1;
    return Math.floor(v);
  };
  return {
    max_hp: apply('max_hp', 'max_hp'),
    max_mp: apply('max_mp', 'max_mp'),
    attack: apply('attack', 'attack'),
    magic: apply('magic', 'magic'),
    defense: apply('defense', 'defense'),
    spirit: b.spirit,
    speed: apply('speed', 'speed'),
  };
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
    '- Job: **flat additive** from jobs table',
    '- Sub: 40% of sub job flat mods',
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

  lines.push('## Phase2 simulation (GPT draft mults, equipment excluded)');
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
