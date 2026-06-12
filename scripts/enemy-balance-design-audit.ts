/** enemy-balance-design-audit — npx tsx scripts/enemy-balance-design-audit.ts */
import { getDb } from '../src/db/database';
import {
  computeBaseStatsFromLevel, applyJobStatMultipliers,
  isPhase2AdvancedMain, ADVANCED_MAIN_JOB_MULTS,
} from '../src/db/seedData/jobMultiplierMaster';
import { JOB_TRIO_MAP, getSubForBaseJob, getBaseJobForAdvanced } from '../src/db/seedData/jobProgressionMaster';
import {
  scaleMonsterForBattle, getMonsterThreatTier, calcPhysicalDamage,
  ENEMY_HIT_PCT_V2, ENEMY_HP_DAMAGE_WEIGHT, ENEMY_STAT_DAMAGE_WEIGHT,
  type ThreatTier,
} from '../src/systems/combatMath';
import { initAuditDb } from './audit/acquisitionIndex';
import { writeReport, writeCsv, mdTable } from './audit/reportWriter';

const PLAYER_LEVELS = [1, 5, 10, 20, 30, 40, 50, 55, 70, 80, 90, 100];
const BASIC_JOBS = Object.keys(JOB_TRIO_MAP);
const ADVANCED_JOBS = Object.values(JOB_TRIO_MAP).map((t) => t.advanced).concat(['星巡の導き手']);
const ALL_JOBS = [...new Set([...BASIC_JOBS, ...ADVANCED_JOBS])];

const LEVEL_BANDS = [
  { label: 'Lv1-10', min: 1, max: 10 },
  { label: 'Lv15-25', min: 15, max: 25 },
  { label: 'Lv30-40', min: 30, max: 40 },
  { label: 'Lv45-55', min: 45, max: 55 },
  { label: 'Lv70', min: 70, max: 70 },
  { label: 'Lv80', min: 80, max: 80 },
  { label: 'Lv90-100', min: 90, max: 100 },
];

type LoadoutTier = 'bare' | 'min' | 'standard' | 'good' | 'uni' | 'src' | 'advanced_full';

type EqRow = {
  slot: string; attack_bonus: number; magic_bonus: number; defense_bonus: number;
  hp_bonus: number; mp_bonus: number; speed_bonus: number; required_level: number; rarity: string;
};

function resolveSub(mainJob: string): string | null {
  if (isPhase2AdvancedMain(mainJob)) {
    const base = getBaseJobForAdvanced(mainJob);
    return base ? getSubForBaseJob(base) : null;
  }
  return getSubForBaseJob(mainJob) ?? '繋ぎ手';
}

function queryEquipment(db: ReturnType<typeof getDb>, level: number, rarities: string[], slot?: string): EqRow | undefined {
  const slotClause = slot ? 'AND e.slot = ?' : "AND e.slot IN ('weapon','head','body','arms','legs','feet')";
  const params = slot ? [level, ...rarities, slot] : [level, ...rarities];
  return db.prepare(`
    SELECT e.slot, e.attack_bonus, e.magic_bonus, e.defense_bonus, e.hp_bonus, e.mp_bonus, e.speed_bonus,
      e.required_level, i.rarity
    FROM equipment e JOIN items i ON e.item_id = i.id
    WHERE e.required_level <= ? AND i.rarity IN (${rarities.map(() => '?').join(',')}) ${slotClause}
    ORDER BY (e.attack_bonus + e.magic_bonus + e.defense_bonus + e.hp_bonus) DESC
    LIMIT 1
  `).get(...params) as EqRow | undefined;
}

function queryWeaponByPattern(db: ReturnType<typeof getDb>, pattern: string, level: number): EqRow | undefined {
  return db.prepare(`
    SELECT e.slot, e.attack_bonus, e.magic_bonus, e.defense_bonus, e.hp_bonus, e.mp_bonus, e.speed_bonus,
      e.required_level, i.rarity
    FROM equipment e JOIN items i ON e.item_id = i.id
    WHERE i.id LIKE ? AND e.required_level <= ?
    ORDER BY (e.attack_bonus + e.magic_bonus) DESC LIMIT 1
  `).get(pattern, level) as EqRow | undefined;
}

function addEquipment(base: ReturnType<typeof computeBaseStatsFromLevel>, pieces: EqRow[]): void {
  for (const eq of pieces) {
    base.attack += eq.attack_bonus;
    base.magic += eq.magic_bonus;
    base.defense += eq.defense_bonus;
    base.max_hp += eq.hp_bonus;
    base.max_mp += eq.mp_bonus;
    base.speed += eq.speed_bonus;
  }
}

function buildLoadout(db: ReturnType<typeof getDb>, level: number, mainJob: string, tier: LoadoutTier) {
  const sub = resolveSub(mainJob);
  const base = computeBaseStatsFromLevel(level);
  applyJobStatMultipliers(base, mainJob, sub);

  const pieces: EqRow[] = [];
  if (tier === 'bare') return { base, sub, pieces, label: '装備なし' };

  const rarByTier: Record<LoadoutTier, string[]> = {
    bare: [],
    min: ['N', 'R'],
    standard: ['R', 'SR'],
    good: ['SR', 'SSR'],
    uni: ['Uni'],
    src: ['Src'],
    advanced_full: ['Src', 'SSR', 'UR'],
  };
  const rarities = rarByTier[tier];

  if (tier === 'uni') {
    const w = queryWeaponByPattern(db, 'wpn_unique_%', level) ?? queryEquipment(db, level, ['Uni'], 'weapon');
    if (w) pieces.push(w);
  } else if (tier === 'src') {
    const w = queryWeaponByPattern(db, 'wpn_src_%', level) ?? queryEquipment(db, level, ['Src'], 'weapon');
    if (w) pieces.push(w);
  } else {
    const w = queryEquipment(db, level, rarities, 'weapon');
    if (w) pieces.push(w);
  }

  if (tier === 'advanced_full') {
    for (const slot of ['head', 'body', 'arms', 'legs', 'feet'] as const) {
      const a = queryEquipment(db, level, ['SSR', 'UR', 'SR'], slot);
      if (a) pieces.push(a);
    }
  } else if (tier !== 'uni' && tier !== 'src') {
    for (const slot of ['head', 'body'] as const) {
      const a = queryEquipment(db, level, rarities, slot);
      if (a) pieces.push(a);
    }
  }

  addEquipment(base, pieces);
  const labels: Record<LoadoutTier, string> = {
    bare: '装備なし', min: '最低装備', standard: '標準装備', good: '整った装備',
    uni: 'Uni武器', src: 'Src武器', advanced_full: '上級+Src+防具更新',
  };
  return { base, sub, pieces, label: labels[tier] };
}

function indices(s: ReturnType<typeof computeBaseStatsFromLevel>) {
  return {
    physical_index: s.attack + s.defense * 0.5,
    magic_index: s.magic + s.spirit * 0.5,
    durability_index: s.max_hp + s.defense * 8,
  };
}

function avg(nums: number[]) {
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
}

function estimateKillTurns(playerAtk: number, enemyHp: number, enemyDef: number, skillMult = 1.3): number {
  const dmg = calcPhysicalDamage(playerAtk, enemyDef, skillMult, 0);
  return Math.max(1, Math.ceil(enemyHp / Math.max(1, dmg)));
}

function estimateHitRatio(enemyAtk: number, playerDef: number, playerMaxHp: number, tier: ThreatTier): number {
  const pct = ENEMY_HIT_PCT_V2[tier] ?? ENEMY_HIT_PCT_V2.normal;
  const hpRoll = (pct.min + pct.max) / 2;
  const statDmg = calcPhysicalDamage(enemyAtk, playerDef, 1, 0);
  const blended = Math.floor(playerMaxHp * hpRoll * ENEMY_HP_DAMAGE_WEIGHT + statDmg * ENEMY_STAT_DAMAGE_WEIGHT);
  return blended / Math.max(1, playerMaxHp);
}

function evaluateBalance(killTurns: number, hitRatio: number): string {
  if (killTurns <= 2 && hitRatio < 0.06) return '敵弱い';
  if (killTurns >= 10 || hitRatio >= 0.22) return '敵強すぎ';
  if (killTurns >= 7 || hitRatio >= 0.18) return 'やや厳しい';
  if (killTurns <= 3 && hitRatio <= 0.08) return 'やや楽';
  return '適正';
}

function main() {
  const db = initAuditDb();

  const playerSampleRows: string[][] = [];
  const playerCsvRows: string[][] = [];
  for (const level of PLAYER_LEVELS) {
    for (const job of ALL_JOBS) {
      for (const tier of ['bare', 'standard', 'good'] as LoadoutTier[]) {
        const { base, sub, label } = buildLoadout(db, level, job, tier);
        const idx = indices(base);
        playerSampleRows.push([
          job, String(level), job, sub ?? '—',
          String(base.max_hp), String(base.max_mp), String(base.attack), String(base.magic),
          String(base.defense), String(base.speed),
          idx.physical_index.toFixed(1), idx.magic_index.toFixed(1), idx.durability_index.toFixed(0),
          label,
        ]);
        playerCsvRows.push([job, String(level), job, sub ?? '', ...playerSampleRows[playerSampleRows.length - 1]!.slice(4)]);
      }
    }
  }

  const bandRows: string[][] = [];
  for (const band of LEVEL_BANDS) {
    const lv = Math.floor((band.min + band.max) / 2);
    for (const tier of ['min', 'standard', 'good', 'uni', 'src', 'advanced_full'] as LoadoutTier[]) {
      const job = tier === 'advanced_full' ? '黄昏剣聖' : '剣士';
      const { base, label } = buildLoadout(db, lv, job, tier);
      const idx = indices(base);
      bandRows.push([
        band.label, tier, job, String(lv),
        String(base.max_hp), String(base.attack), String(base.magic), String(base.defense),
        idx.physical_index.toFixed(1), idx.durability_index.toFixed(0), label,
      ]);
    }
  }

  const monsters = db.prepare(`
    SELECT id, name, area_tag, level, hp, attack, magic, defense, spirit, speed, break_max,
      exp_reward, gold_reward, drop_pool_json, ai_pattern_json, is_boss
    FROM monsters ORDER BY level, name
  `).all() as Array<Record<string, unknown>>;

  const monsterRows: string[][] = [];
  const monsterCsv: string[][] = [];
  for (const m of monsters) {
    const scaled = scaleMonsterForBattle(m as Parameters<typeof scaleMonsterForBattle>[0]);
    const tier = getMonsterThreatTier(m.id as string, { forceBoss: m.is_boss === 1 });
    let ai = 'normal';
    try { ai = (JSON.parse(String(m.ai_pattern_json || '{}')) as { pattern?: string }).pattern ?? 'normal'; } catch { /* */ }
    monsterRows.push([
      String(m.id), String(m.name), String(m.level), String(m.area_tag), tier,
      String(scaled.hp), String(scaled.attack), String(scaled.magic), String(scaled.defense), String(scaled.speed),
      String(m.break_max), String(m.exp_reward), String(m.gold_reward),
      ai, m.is_boss ? 'boss' : tier,
    ]);
    monsterCsv.push([
      String(m.id), String(m.name), String(m.level), String(m.area_tag), tier,
      String(scaled.hp), String(scaled.attack), String(scaled.magic), String(scaled.defense), String(scaled.speed),
      String(m.break_max ?? ''), String(m.exp_reward), String(m.gold_reward), String(m.drop_pool_json ?? '').slice(0, 80),
      ai, tier,
    ]);
  }

  const areas = db.prepare(`
    SELECT ea.id, ea.name, ea.town_id, ea.recommended_min_level, ea.recommended_max_level,
      ea.monster_pool_json, ea.reward_pool_json, t.name AS town_name
    FROM exploration_areas ea LEFT JOIN towns t ON ea.town_id = t.id
    ORDER BY ea.recommended_min_level
  `).all() as Array<{
    id: string; name: string; town_id: string; recommended_min_level: number; recommended_max_level: number;
    monster_pool_json: string; reward_pool_json: string; town_name: string | null;
  }>;

  const areaRows: string[][] = [];
  const compareRows: string[][] = [];
  const evalRows: string[][] = [];

  for (const area of areas) {
    const pool = JSON.parse(area.monster_pool_json || '[]') as Array<{ monster_id: string }>;
    const rewards = JSON.parse(area.reward_pool_json || '[]') as Array<{ item_id: string }>;
    const recLv = Math.floor((area.recommended_min_level + area.recommended_max_level) / 2);

    const monStats: Array<{ tier: ThreatTier; scaled: ReturnType<typeof scaleMonsterForBattle> }> = [];
    for (const p of pool) {
      const raw = monsters.find((m) => m.id === p.monster_id);
      if (!raw) continue;
      monStats.push({
        tier: getMonsterThreatTier(p.monster_id),
        scaled: scaleMonsterForBattle(raw as Parameters<typeof scaleMonsterForBattle>[0]),
      });
    }
    const normals = monStats.filter((m) => m.tier === 'normal');
    const toughs = monStats.filter((m) => m.tier === 'tough');
    const rares = monStats.filter((m) => m.tier === 'rare' || m.tier === 'elite');
    const bosses = monStats.filter((m) => m.tier === 'boss');

    areaRows.push([
      area.id, area.name, area.town_name ?? area.town_id,
      `${area.recommended_min_level}-${area.recommended_max_level}`,
      String(pool.length),
      normals.length ? String(Math.round(avg(normals.map((n) => n.scaled.hp)))) : '—',
      normals.length ? String(Math.round(avg(normals.map((n) => n.scaled.attack)))) : '—',
      normals.length ? String(Math.round(avg(normals.map((n) => n.scaled.magic)))) : '—',
      normals.length ? String(Math.round(avg(normals.map((n) => n.scaled.defense)))) : '—',
      normals.length ? String(Math.round(avg(normals.map((n) => n.scaled.speed)))) : '—',
      `${rares.length ? 'rare/elite' : '—'}/${bosses.length ? 'boss' : '—'}`,
      rewards.some((r) => r.item_id.startsWith('arm_') || r.item_id.startsWith('wpn_')) ? 'YES' : 'NO',
    ]);

    for (const delta of [-5, 0, 5, 10]) {
      const pLv = Math.max(1, recLv + delta);
      const { base: player } = buildLoadout(db, pLv, '剣士', delta >= 5 ? 'good' : 'standard');
      const ref = normals[0]?.scaled ?? monStats[0]?.scaled;
      if (!ref) continue;
      const killN = estimateKillTurns(player.attack, ref.hp, ref.defense);
      const killT = toughs[0] ? estimateKillTurns(player.attack, toughs[0].scaled.hp, toughs[0].scaled.defense) : killN + 2;
      const killR = rares[0] ? estimateKillTurns(player.attack, rares[0].scaled.hp, rares[0].scaled.defense) : killN + 4;
      const hitN = estimateHitRatio(ref.attack, player.defense, player.max_hp, 'normal');
      const verdict = evaluateBalance(killN, hitN);
      compareRows.push([
        area.name, String(recLv), String(delta >= 0 ? `+${delta}` : delta), String(pLv),
        String(killN), String(killT), String(killR), `${(hitN * 100).toFixed(1)}%`, verdict,
      ]);
      if (delta === 0) {
        evalRows.push([area.name, String(recLv), '推奨Lv', String(killN), `${(hitN * 100).toFixed(1)}%`, verdict]);
      } else if (delta === -5) {
        evalRows.push([area.name, String(recLv), '推奨Lv-5', String(killN), `${(hitN * 100).toFixed(1)}%`, verdict]);
      } else if (delta === 5) {
        evalRows.push([area.name, String(recLv), '推奨Lv+5', String(killN), `${(hitN * 100).toFixed(1)}%`, verdict]);
      } else if (delta === 10) {
        evalRows.push([area.name, String(recLv), '推奨Lv+10', String(killN), `${(hitN * 100).toFixed(1)}%`, verdict]);
      }
    }
  }

  const valhallaAreas = areas.filter((a) => a.town_id === 'valhalla_fortress');
  const valhallaEval = valhallaAreas.map((a) => {
    const rec = Math.floor((a.recommended_min_level + a.recommended_max_level) / 2);
    const p80 = buildLoadout(db, 80, '剣士', 'good').base;
    const p90 = buildLoadout(db, 90, '黄昏剣聖', 'advanced_full').base;
    return `- ${a.name} (推奨${rec}): Lv80基本 ${estimateKillTurns(p80.attack, 400, 30)}T / Lv90上級 ${estimateKillTurns(p90.attack, 400, 30)}T`;
  });

  const md = [
    '# Enemy Balance Design Audit',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    '> Phase2 player-side buff vs **enemyBalanceV2** scaled enemy stats.',
    '',
    '## 4-1 Player sample (剣士/all jobs × levels × loadout)',
    'See CSV for full matrix. Sample (剣士, bare/standard/good):',
    mdTable(
      ['job', 'level', 'max_hp', 'attack', 'magic', 'defense', 'phys_idx', 'dur_idx', 'loadout'],
      playerSampleRows.filter((r) => r[0] === '剣士' && ['1', '20', '50', '70', '100'].includes(r[1]!) && r[13] !== '整った装備').slice(0, 12),
    ),
    '',
    '## 4-2 Loadout bands',
    mdTable(['band', 'tier', 'job', 'level', 'max_hp', 'attack', 'magic', 'def', 'phys_idx', 'dur_idx', 'label'], bandRows),
    '',
    '## 4-3 Monster stats (scaled for battle)',
    `Total monsters: ${monsters.length}. See CSV for full list.`,
    mdTable(['id', 'name', 'lv', 'area', 'tier', 'hp', 'atk', 'mag', 'def', 'spd', 'type'], monsterRows.slice(0, 15)),
    '',
    '## 4-4 Area summary',
    mdTable(['area', 'town', 'recLv', 'monsters', 'avgHP', 'avgATK', 'avgMAG', 'avgDEF', 'avgSPD', 'rare/boss', 'equip_drop'], areaRows.slice(0, 20)),
    `... ${areaRows.length} areas total`,
    '',
    '## 4-5 Recommended level comparison (剣士 standard/good loadout)',
    mdTable(['area', 'recLv', 'playerΔ', 'playerLv', 'kill_normal', 'kill_tough', 'kill_rare', 'hit%/maxHP', '評価'], compareRows.slice(0, 24)),
    '',
    '## 4-6 High-difficulty policy evaluation',
    '',
    '### Design targets',
    '- 推奨Lv-5: かなり厳しい（装備・回復・職相性必須）',
    '- 推奨Lv: 普通に勝てるが連戦/複数敵で消耗',
    '- 推奨Lv+5: 安定、rare/elite/bossは油断不可',
    '- 推奨Lv+10: 通常敵周回可、ヴァルハラ/レイドは別',
    '',
    '### Area verdicts (normal enemies, standard loadout)',
    mdTable(['area', 'recLv', 'scenario', 'kill_turns', 'hit_ratio', 'verdict'], evalRows.slice(0, 30)),
    '',
    '### Valhalla snapshot',
    ...valhallaEval,
    '- レイド: 上級職 + Uni/Src + 防具更新前提（別枠）',
    '',
    '### Aggregate (recLv scenarios)',
    ...(['推奨Lv-5', '推奨Lv', '推奨Lv+5', '推奨Lv+10'] as const).map((sc) => {
      const subset = evalRows.filter((r) => r[2] === sc);
      const weak = subset.filter((r) => r[5] === '敵弱い').length;
      const ok = subset.filter((r) => r[5] === '適正' || r[5] === 'やや楽').length;
      const hard = subset.filter((r) => r[5] === 'やや厳しい' || r[5] === '敵強すぎ').length;
      return `- ${sc}: 適正${ok} / やや厳しい〜強${hard} / 敵弱い${weak} （${subset.length} areas）`;
    }),
  ].join('\n');

  writeReport('enemy-balance-design-audit.md', md);
  writeCsv('enemy-balance-design-audit.csv', [
    'section', 'job', 'level', 'main_job', 'sub_job', 'max_hp', 'max_mp', 'attack', 'magic', 'defense', 'speed',
    'physical_index', 'magic_index', 'durability_index', 'loadout', 'extra',
  ], [
    ...playerCsvRows.map((r) => ['player_sample', ...r, '']),
    ...bandRows.map((r) => ['loadout_band', r[2]!, r[3]!, '', r[4]!, '', r[5]!, r[6]!, r[7]!, '', r[8]!, '', r[9]!, r[10]!, '']),
    ...monsterCsv.map((r) => ['monster', '', String(r[2]), '', '', String(r[5]), '', String(r[6]), String(r[7]), String(r[8]), String(r[9]), '', '', '', r[4]!, r.join('|')]),
    ...compareRows.map((r) => ['area_compare', '剣士', r[3]!, '', '', '', '', '', '', '', '', '', '', '', r.join('|')]),
  ]);
  console.log('✅ enemy-balance-design-audit → reports/enemy-balance-design-audit.{md,csv}');
}

main();
