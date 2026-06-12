/**
 * Game data inventory report — run: npx tsx scripts/export-game-data-report.ts
 * Read-only; does not modify game behavior.
 */
import { AREAS } from '../src/db/seedData/areas';
import { CHAPTERS, STORY_BOSS_MONSTERS, BOSS_CHAPTER_REWARDS } from '../src/db/seedData/storyData';
import {
  AWAKENING_DUP_COST_NR, AWAKENING_DUP_COST_SR, AWAKENING_DUP_COST_UR,
  AWAKENING_ELIGIBLE_RARITIES, MAX_AWAKENING_LEVEL, awakeningLabel,
  KAI_UNIQUE_TARGETS, totalDuplicatesForMaxAwakening,
} from '../src/db/seedData/awakeningMaster';
import { CHAPTER_LEVEL_BANDS } from '../src/db/seedData/progressionMaster';
import { resolveSkillEffect } from '../src/db/seedData/skillEffectMaster';
import { ALL_JOB_SKILLS } from '../src/db/seedData/jobSkillData';
import {
  scaleMonsterForBattle, getMonsterThreatTier, calcPhysicalDamage, calcEnemyDamageToPlayer,
} from '../src/systems/combatMath';
import { getDifficultyModifiers } from '../src/systems/difficultySystem';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

function tryDb(): import('better-sqlite3').Database | null {
  try {
    const { getDb } = require('../src/db/database');
    return getDb();
  } catch {
    return null;
  }
}

function mdRow(cells: (string | number)[]): string {
  return '| ' + cells.map((c) => String(c).replace(/\|/g, '\\|').replace(/\n/g, ' ')).join(' | ') + ' |';
}

function section(title: string, body: string): void {
  console.log(`\n## ${title}\n`);
  console.log(body);
}

const PURE_SUPPORT_EFFECTS = new Set([
  'heal', 'guard', 'scan', 'trap', 'taunt', 'cure_poison', 'flee_buff', 'mag_buff', 'atk_buff', 'def_buff',
]);

function collectSkillMismatches(skills: Array<{
  id: string; name: string; power: number; skill_type: string;
  effect_type?: string | null; status_effect?: string | null;
}>): string[] {
  const issues: string[] = [];
  for (const s of skills) {
    const fx = resolveSkillEffect(s.id, s.effect_type ?? null, s.status_effect ?? null);
    const hasDmg = s.power > 0 && !['recovery', 'support', 'guard'].includes(s.skill_type);
    const isComposite = hasDmg && ['slow', 'bind'].includes(s.effect_type ?? '') && fx.implemented;
    const dmgBlocked = hasDmg && PURE_SUPPORT_EFFECTS.has(s.effect_type ?? '') && !isComposite;
    if (dmgBlocked) {
      issues.push(`${s.id} (${s.name}): power=${s.power} だが effect_type=${s.effect_type} でダメージ未到達`);
    }
  }
  return issues;
}

function main() {
  const db = tryDb();
  if (!db) {
    console.log('> DB未接続 — seed後に `npx tsx scripts/export-game-data-report.ts` で詳細一覧が出ます。\n');
  }

  // --- Summary counts ---
  const counts: Row = {};
  if (db) {
    counts.weapons = (db.prepare(`SELECT COUNT(*) c FROM equipment e JOIN items i ON e.item_id=i.id WHERE e.slot='weapon'`).get() as { c: number }).c;
    counts.armor = (db.prepare(`SELECT COUNT(*) c FROM equipment e WHERE e.slot IN ('head','body','arms','legs','feet')`).get() as { c: number }).c;
    counts.accessories = (db.prepare(`SELECT COUNT(*) c FROM equipment e WHERE e.slot LIKE 'accessory%'`).get() as { c: number }).c;
    counts.materials = (db.prepare(`SELECT COUNT(*) c FROM items WHERE category NOT IN ('equipment')`).get() as { c: number }).c;
    counts.monsters = (db.prepare('SELECT COUNT(*) c FROM monsters').get() as { c: number }).c;
    counts.skills = (db.prepare('SELECT COUNT(*) c FROM skills').get() as { c: number }).c;
    counts.bosses = (db.prepare('SELECT COUNT(*) c FROM monsters WHERE is_boss=1 OR ai_pattern_json LIKE ?').get('%"boss"%') as { c: number }).c;
    counts.series = (db.prepare('SELECT COUNT(*) c FROM equipment_sets').get() as { c: number }).c;
  }

  section('DATA_COUNTS', JSON.stringify(counts, null, 2));

  // --- Awakening ---
  const awTierRows = (rarity: string, table: Record<number, number>, total: number) =>
    Object.entries(table).map(([from, need]) => {
      const fromN = Number(from);
      return mdRow([
        rarity,
        `${awakeningLabel(fromN)}→${awakeningLabel(fromN + 1)}`,
        need,
        total,
        '+1主stat/+1HP',
        '微増',
        fromN + 1 >= MAX_AWAKENING_LEVEL ? '可(カイ)' : '—',
      ]);
    });
  section('AWAKENING', [
    mdRow(['対象', '段階', '必要同名', '合計', 'stat', '耐久', 'ユニーク']),
    mdRow(['---', '---', '---', '---', '---', '---', '---']),
    ...awTierRows('N/R', AWAKENING_DUP_COST_NR, totalDuplicatesForMaxAwakening('N')),
    ...awTierRows('SR', AWAKENING_DUP_COST_SR, totalDuplicatesForMaxAwakening('SR')),
    ...awTierRows('UR', AWAKENING_DUP_COST_UR, totalDuplicatesForMaxAwakening('UR')),
    '',
    `最大段階: ${awakeningLabel(MAX_AWAKENING_LEVEL)} / 既存覚醒V(level5)は「最大覚醒」として互換`,
    `合計: N/R ${totalDuplicatesForMaxAwakening('N')}本 / SR ${totalDuplicatesForMaxAwakening('SR')}本 / UR ${totalDuplicatesForMaxAwakening('UR')}本`,
  ].join('\n'));

  // --- KAI targets ---
  section('KAI_UNIQUE_TARGETS', Object.entries(KAI_UNIQUE_TARGETS).map(([k, v]) => `- ${k} → ${v}`).join('\n'));

  // --- Boss list ---
  const bossLines = Object.entries(STORY_BOSS_MONSTERS).map(([bossKey, monId]) => {
    const ch = BOSS_CHAPTER_REWARDS[bossKey];
    return mdRow([monId, bossKey, ch?.chapterFlag ?? '—', ch?.unlockTown ?? '—', ch?.starShard ?? 0]);
  });
  section('STORY_BOSSES', [
    mdRow(['monster_id', 'boss_key', 'chapter_flag', 'unlock_town', 'star_shard']),
    mdRow(['---', '---', '---', '---', '---']),
    ...bossLines,
    '',
    `章数: ${CHAPTERS.length} / ストーリーボス: ${Object.keys(STORY_BOSS_MONSTERS).length}`,
  ].join('\n'));

  // --- Encounter rates (from phase2 event pools) ---
  section('ENCOUNTER_RATES', [
    '| tier | battle% | material% | treasure% | npc% | nothing% |',
    '| --- | --- | --- | --- | --- | --- |',
    '| early | 55 | 20 | 13 | 7 | 5 |',
    '| mid | 57 | 19 | 12 | 7 | 5 |',
    '| late | 60 | 17 | 11 | 7 | 5 |',
    '| valhalla | 65 | 15 | 12 | 3 | 5 |',
    '',
    '方針: early55 / mid57 / late60 / valhalla65（phase2Seed EVENT_POOLS と一致）',
  ].join('\n'));

  section('ICE_NEEDLE', [
    '- power>0 + slow/bind: battleSystem.ts でダメージ→状態異常の順（修正済）',
    '- bs_ice_needle / bs_bind_arrow / bs_shadow_stitch / bs_arc_jam: 複合スキルとして実装済',
  ].join('\n'));

  section('HP_BUG', 'battleSystem getEnemyHpDisplay: combatScale.hp を max に使用（修正済）');

  const masterSkillIssues = collectSkillMismatches(ALL_JOB_SKILLS.map((s) => ({
    id: s.id,
    name: s.name,
    power: s.power,
    skill_type: s.skill_type,
    effect_type: s.effect_type,
  })));
  section('SKILL_MISMATCHES', masterSkillIssues.length ? masterSkillIssues.join('\n') : 'なし（0件）');

  section('ECONOMY_SAMPLE', [
    '宿屋: calcRestCost(userId, townId) — 30+Lv×3 (序盤cap80) / 100+Lv×4 (中盤cap250) / 300+Lv×6 (高cap700) / 800+Lv×8 (ヴァルハラcap1500)',
    '救護所: 宿屋と同額 — calcRestCost(userId, townId) を共用（60%割引廃止）',
    'preview: 宿屋・救護所とも formatRestPreview で事前表示あり',
    '灯火の小瓶: 200G sell / tradeable=1 / is_pending_reward中は売却不可',
    '薄明の貝殻: 25G sell / 探索ドロップはpending→帰還(finalizeExplorationLoot)で解除',
  ].join('\n'));

  if (!db) {
    section('BALANCE_SIM', 'DB未接続 — seed後に章別シミュレーションが出力されます');
    return;
  }

  // --- Weapons table (abbreviated columns) ---
  const weapons = db.prepare(`
    SELECT i.id, i.name, i.rarity, e.weapon_type, e.attack_bonus, e.magic_bonus, e.max_upgrade_level,
      e.is_unique, e.src_weapon_id, e.series_id, i.tradeable, i.sell_price, i.source_text
    FROM equipment e JOIN items i ON e.item_id=i.id WHERE e.slot='weapon' ORDER BY i.rarity, i.name
  `).all() as Row[];

  const wpnLines = weapons.map((w) => mdRow([
    w.id, w.name, w.rarity, w.weapon_type ?? '—', w.series_id ?? '未設定',
    `攻${w.attack_bonus}/魔${w.magic_bonus}`, w.max_upgrade_level,
    AWAKENING_ELIGIBLE_RARITIES.has(w.rarity) ? '可' : '不可',
    KAI_UNIQUE_TARGETS[w.id] ? '対象' : w.is_unique ? '済' : '—',
    w.src_weapon_id ? '可' : '—',
    w.source_text?.slice(0, 30) ?? '探索・ドロップ',
    w.tradeable ? '可' : '不可',
  ]));
  section('WEAPONS', [
    mdRow(['id', '名称', 'レア', '種別', 'シリーズ', '基礎', '強化上限', '覚醒', 'ユニーク', 'Src', '入手', '売却']),
    mdRow(['---', '---', '---', '---', '---', '---', '---', '---', '---', '---', '---', '---']),
    ...wpnLines,
  ].join('\n'));

  // --- Materials ---
  const mats = db.prepare(`
    SELECT id, name, category, rarity, usage_text, source_text, sell_price, tradeable FROM items
    WHERE category NOT IN ('equipment') ORDER BY category, rarity, name
  `).all() as Row[];
  section('MATERIALS', [
    mdRow(['id', '名称', '種別', 'レア', '用途', '入手', '売却価', '取引']),
    mdRow(['---', '---', '---', '---', '---', '---', '---', '---']),
    ...mats.map((m) => mdRow([m.id, m.name, m.category, m.rarity, m.usage_text, m.source_text, m.sell_price, m.tradeable ? '可' : '不可'])),
  ].join('\n'));

  // --- Monsters (sample + EXP spread per area) ---
  const monsters = db.prepare('SELECT * FROM monsters ORDER BY area_tag, level').all() as Row[];
  const monLines = monsters.map((m) => {
    const scale = scaleMonsterForBattle({ ...m, id: m.id });
    const tier = getMonsterThreatTier(m.id, { isStoryBoss: m.is_boss === 1 });
    return mdRow([
      m.id, m.name, m.area_tag, m.level, tier, m.is_boss ? 'boss' : '通常',
      m.hp, scale.hp, m.attack, scale.attack, m.exp_reward, m.gold_reward,
    ]);
  });
  section('MONSTERS', [
    mdRow(['id', '名称', 'area', 'Lv', 'tier', '分類', 'HP基', 'HP戦闘', '攻基', '攻戦闘', 'EXP', 'G']),
    mdRow(['---', '---', '---', '---', '---', '---', '---', '---', '---', '---', '---', '---']),
    ...monLines,
  ].join('\n'));

  // --- Area EXP spread ---
  const areaExpLines: string[] = [];
  for (const area of AREAS) {
    const pool = area.monsters;
    const exps = pool.map((mid) => {
      const r = db.prepare('SELECT exp_reward, name FROM monsters WHERE id=?').get(mid) as { exp_reward: number; name: string } | undefined;
      return r ? { name: r.name, exp: r.exp_reward } : null;
    }).filter(Boolean) as Array<{ name: string; exp: number }>;
    if (exps.length < 2) continue;
    const vals = exps.map((e) => e.exp);
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const ratio = max / Math.max(1, min);
    if (ratio > 1.5) {
      areaExpLines.push(`- ${area.name}: EXP ${min}-${max} (×${ratio.toFixed(2)}) ${exps.map((e) => e.name).join(', ')}`);
    }
  }
  section('AREA_EXP_SPREAD', areaExpLines.join('\n') || '大きなブレなし(×1.5以下)');

  // --- Skills with mismatch ---
  const skills = db.prepare('SELECT * FROM skills ORDER BY job_id, name').all() as Row[];
  const skillIssues = collectSkillMismatches(skills);
  const skillLines = skills.map((s) => {
    const fx = resolveSkillEffect(s.id, s.effect_type, s.status_effect);
    const hasDmg = s.power > 0 && !['recovery', 'support', 'guard'].includes(s.skill_type);
    const isComposite = hasDmg && ['slow', 'bind'].includes(s.effect_type ?? '') && fx.implemented;
    const dmgBlocked = hasDmg && PURE_SUPPORT_EFFECTS.has(s.effect_type ?? '') && !isComposite;
    return mdRow([
      s.id, s.name, s.job_id?.replace('job_', ''), s.mp_cost, s.power, s.skill_type,
      s.effect_type ?? '—', fx.implementationKey, dmgBlocked ? '⚠不一致' : isComposite ? '複合OK' : 'OK',
    ]);
  });
  section('SKILLS', [
    mdRow(['id', '名称', '職', 'MP', 'power', 'type', 'effect', 'impl', '判定']),
    mdRow(['---', '---', '---', '---', '---', '---', '---', '---', '---']),
    ...skillLines.slice(0, 120),
    skillLines.length > 120 ? `\n...他${skillLines.length - 120}件` : '',
  ].join('\n'));
  if (skillIssues.length) {
    section('SKILL_DB_MISMATCHES', skillIssues.join('\n'));
  }

  const CHAPTER_BALANCE_SAMPLES: Record<string, { areaId: string; monsterIds: string[] }> = {
    ch7_furnace: {
      areaId: 'area_core_tower',
      monsterIds: ['mon_core_drone', 'mon_mech_type2', 'mon_furnace_keeper'],
    },
    ch8_valhalla: {
      areaId: 'area_valhalla_outer',
      monsterIds: ['mon_old_army', 'mon_furnace_defense', 'mon_old_king_shadow'],
    },
  };

  // --- Balance simulation per chapter ---
  const simLines: string[] = [];
  for (const ch of CHAPTERS.slice(0, 9)) {
    const band = CHAPTER_LEVEL_BANDS[ch.id];
    if (!band) continue;
    const lv = Math.floor((band.min + band.max) / 2);
    const sample = CHAPTER_BALANCE_SAMPLES[ch.id];
    if (sample) {
      const sampleArea = AREAS.find((a) => a.id === sample.areaId);
      if (!sampleArea) continue;
      for (const monId of sample.monsterIds) {
        const mon = db.prepare('SELECT * FROM monsters WHERE id=?').get(monId) as Row;
        if (!mon) continue;
        const scale = scaleMonsterForBattle({ ...mon, id: monId });
        const diff = getDifficultyModifiers(lv, sampleArea.min, sampleArea.max);
        const playerDef = 8 + (lv - 1) + 20;
        const playerAtk = 10 + (lv - 1) * 2 + 15;
        const playerHp = 100 + (lv - 1) * 15 + 30;
        const pDmg = calcPhysicalDamage(playerAtk, scale.defense, diff.playerDamage);
        const eDmg = calcEnemyDamageToPlayer({ attack: scale.attack, playerDefense: playerDef, playerMaxHp: playerHp, threatTier: scale.threatTier, takenMult: diff.playerTaken });
        const turns = Math.ceil(scale.hp / Math.max(1, pDmg));
        simLines.push(mdRow([ch.title, lv, sampleArea.name, mon.name, playerHp, playerAtk, scale.hp, pDmg, eDmg, turns]));
      }
      continue;
    }
    const townAreas = AREAS.filter((a) => {
      const town = db.prepare('SELECT required_level FROM towns WHERE id=?').get(a.town) as { required_level: number } | undefined;
      return town && town.required_level <= lv + 5;
    });
    const sampleArea = townAreas.find((a) => a.min <= lv && a.max >= lv) ?? townAreas[0];
    if (!sampleArea) continue;
    const monId = sampleArea.monsters[0];
    const mon = db.prepare('SELECT * FROM monsters WHERE id=?').get(monId) as Row;
    if (!mon) continue;
    const scale = scaleMonsterForBattle({ ...mon, id: monId });
    const diff = getDifficultyModifiers(lv, sampleArea.min, sampleArea.max);
    const playerDef = 8 + (lv - 1) + 20;
    const playerAtk = 10 + (lv - 1) * 2 + 15;
    const playerHp = 100 + (lv - 1) * 15 + 30;
    const pDmg = calcPhysicalDamage(playerAtk, scale.defense, diff.playerDamage);
    const eDmg = calcEnemyDamageToPlayer({ attack: scale.attack, playerDefense: playerDef, playerMaxHp: playerHp, threatTier: scale.threatTier, takenMult: diff.playerTaken });
    const turns = Math.ceil(scale.hp / Math.max(1, pDmg));
    simLines.push(mdRow([ch.title, lv, sampleArea.name, mon.name, playerHp, playerAtk, scale.hp, pDmg, eDmg, turns]));
  }
  section('BALANCE_SIM', [
    mdRow(['章', '想定Lv', 'エリア', '敵', 'P_HP', 'P_攻', 'E_HP', 'P→E', 'E→P', '討伐手']),
    mdRow(['---', '---', '---', '---', '---', '---', '---', '---', '---', '---']),
    ...simLines,
  ].join('\n'));
}

main();
