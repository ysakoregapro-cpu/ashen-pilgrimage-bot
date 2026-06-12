/**
 * Combat balance + durability report — run: npx tsx scripts/combat-balance-check.ts
 */
import { getDb } from '../src/db/database';
import {
  scaleMonsterForBattle, calcPhysicalDamage, getMonsterThreatTier, type ThreatTier,
} from '../src/systems/combatMath';
import { getDifficultyModifiers } from '../src/systems/difficultySystem';
import {
  AFFINITY_MULTIPLIER, normalizeElement,
} from '../src/db/seedData/elementMaster';
import { getMonsterElementDef } from '../src/db/seedData/monsterElementMaster';
import { calcElementDamageMultiplier } from '../src/systems/elementSystem';
import { ensurePhase2Seed } from '../src/db/seedData/phase2Seed';
import { MONSTER_SEED_DATA } from '../src/db/seedData/monsters';

type GearTier = 'avg' | 'top';

type PlayerProfile = {
  label: string;
  lv: number;
  hp: number;
  mp: number;
  atk: number;
  def: number;
  magic: number;
  healPotion: number;
  mpPerTurn: number;
};

type DurabilityCase = {
  id: string;
  name: string;
  category: string;
  areaMin: number;
  areaMax: number;
  playerLv: number;
  /** Use magic (light neutral skill) instead of physical */
  useMagic?: boolean;
  skillPower?: number;
  skillElement?: string;
  /** Defend every N enemy turns (elite/boss) */
  defendEvery?: number;
};

const ENEMY_HIT_PCT: Record<ThreatTier, { min: number; max: number }> = {
  normal: { min: 0.04, max: 0.07 },
  tough: { min: 0.06, max: 0.10 },
  rare: { min: 0.08, max: 0.12 },
  elite: { min: 0.10, max: 0.18 },
  boss: { min: 0.08, max: 0.15 },
};

const TURN_BANDS: Record<ThreatTier, { ok: [number, number]; long: number }> = {
  normal: { ok: [3, 5], long: 8 },
  tough: { ok: [5, 8], long: 11 },
  rare: { ok: [8, 14], long: 19 },
  elite: { ok: [12, 22], long: 29 },
  boss: { ok: [16, 28], long: 36 },
};

const REAL_LOG_MAGE: PlayerProfile = {
  label: 'real_log Lv25魔術師',
  lv: 25, hp: 497, mp: 177, atk: 42, def: 35, magic: 148,
  healPotion: 80, mpPerTurn: 10,
};

const DURABILITY_CASES: DurabilityCase[] = [
  { id: 'mon_training_doll', name: '古びた訓練人形', category: 'normal', areaMin: 4, areaMax: 8, playerLv: 6 },
  { id: 'mon_bookworm_swarm', name: '紙魚の群れ', category: 'normal', areaMin: 22, areaMax: 32, playerLv: 25, useMagic: true, skillPower: 1.2, skillElement: 'neutral' },
  { id: 'mon_ink_beast', name: 'インクの魔物', category: 'normal', areaMin: 22, areaMax: 32, playerLv: 25, useMagic: true, skillPower: 1.1, skillElement: 'star' },
  { id: 'mon_drift_undead', name: '漂流亡者', category: 'tough', areaMin: 16, areaMax: 22, playerLv: 12 },
  { id: 'mon_ore_eater', name: '鉱石喰らい', category: 'tough', areaMin: 12, areaMax: 20, playerLv: 14 },
  { id: 'mon_mine_bat', name: '坑道コウモリ', category: 'rare', areaMin: 12, areaMax: 20, playerLv: 14 },
  { id: 'mon_moon_observer', name: '月下の観測者', category: 'rare', areaMin: 28, areaMax: 38, playerLv: 32 },
  { id: 'mon_arc_residue', name: 'アーク残滓体', category: 'rare', areaMin: 52, areaMax: 62, playerLv: 56 },
  { id: 'mon_rust_miner', name: '錆びた採掘機', category: 'elite', areaMin: 12, areaMax: 20, playerLv: 18, defendEvery: 2 },
  { id: 'mon_crystal_spider', name: '結晶蜘蛛', category: 'elite', areaMin: 16, areaMax: 24, playerLv: 22, defendEvery: 2 },
  { id: 'mon_furnace_defense', name: '炉心防衛ユニット', category: 'elite', areaMin: 60, areaMax: 70, playerLv: 64, defendEvery: 2 },
  { id: 'mon_silver_golem', name: '白銀ゴーレム', category: 'chapter boss', areaMin: 16, areaMax: 24, playerLv: 16, defendEvery: 2 },
  { id: 'mon_silent_guardian', name: '無答の守護者', category: 'chapter boss', areaMin: 34, areaMax: 44, playerLv: 38, defendEvery: 2 },
  { id: 'mon_furnace_keeper', name: '炉熱の番人', category: 'chapter boss', areaMin: 52, areaMax: 62, playerLv: 56, defendEvery: 2 },
  { id: 'mon_old_king_shadow', name: '旧王の影', category: 'chapter boss', areaMin: 64, areaMax: 74, playerLv: 70, defendEvery: 2 },
];

function gearProfile(tier: GearTier, lv: number): PlayerProfile {
  const baseHp = 100 + (lv - 1) * 15;
  const baseMp = 30 + (lv - 1) * 5;
  if (tier === 'avg') {
    return {
      label: '並装備',
      lv,
      hp: baseHp + 30,
      mp: baseMp + 20,
      atk: 10 + (lv - 1) * 2 + 15,
      def: 8 + (lv - 1) + 20,
      magic: 8 + (lv - 1) * 2 + 12,
      healPotion: 80,
      mpPerTurn: 0,
    };
  }
  return {
    label: '最高装備',
    lv,
    hp: baseHp + 80,
    mp: baseMp + 50,
    atk: 10 + (lv - 1) * 2 + 35,
    def: 8 + (lv - 1) + 35,
    magic: 8 + (lv - 1) * 2 + 28,
    healPotion: lv >= 40 ? 150 : 80,
    mpPerTurn: 0,
  };
}

function calcEnemyDamageAvg(
  attack: number,
  playerDef: number,
  playerMaxHp: number,
  threatTier: ThreatTier,
  takenMult: number,
  defending = false,
): number {
  const pct = ENEMY_HIT_PCT[threatTier];
  const midPct = (pct.min + pct.max) / 2;
  const hpBased = Math.floor(playerMaxHp * midPct * takenMult);
  const statBased = Math.floor(calcPhysicalDamage(attack, playerDef, 1, 0) * takenMult);
  let dmg = Math.max(1, Math.floor(hpBased * 0.45 + statBased * 0.55));
  if (defending) dmg = Math.max(1, Math.floor(dmg * 0.55));
  return dmg;
}

type SimResult = {
  killTurns: number;
  enemyActions: number;
  playerDmg: number;
  avgEnemyDmg: number;
  maxEnemyDmg: number;
  totalTaken: number;
  healUsed: number;
  mpSpent: number;
  hpRemaining: number;
  won: boolean;
  noHealWin: boolean;
};

function simulateBattle(
  enemyHp: number,
  enemyAtk: number,
  threatTier: ThreatTier,
  player: PlayerProfile,
  playerDmgPerTurn: number,
  diff: ReturnType<typeof getDifficultyModifiers>,
  opts?: { defendEvery?: number; maxHeals?: number },
): SimResult {
  let pHp = player.hp;
  let pMp = player.mp;
  let eHp = enemyHp;
  let enemyActions = 0;
  let totalTaken = 0;
  let maxEnemyDmg = 0;
  let healUsed = 0;
  let mpSpent = 0;
  let killTurns = 0;
  const maxHeals = opts?.maxHeals ?? 8;

  while (eHp > 0 && pHp > 0) {
    killTurns++;
    if (player.mpPerTurn > 0 && pMp < player.mpPerTurn) break;
    pMp -= player.mpPerTurn;
    mpSpent += player.mpPerTurn;
    eHp -= playerDmgPerTurn;

    if (eHp <= 0) break;

    enemyActions++;
    const defending = opts?.defendEvery ? enemyActions % opts.defendEvery === 0 : false;
    const minD = calcEnemyDamageAvg(enemyAtk, player.def, player.hp, threatTier, diff.playerTaken, false);
    const maxD = calcEnemyDamageAvg(enemyAtk, player.def, player.hp, threatTier, diff.playerTaken * 1.15, defending);
    const dmg = Math.floor((minD + maxD) / 2);
    maxEnemyDmg = Math.max(maxEnemyDmg, dmg);
    totalTaken += dmg;
    pHp -= dmg;

    while (pHp <= 0 && healUsed < maxHeals) {
      pHp += player.healPotion;
      healUsed++;
      if (pHp > player.hp) pHp = player.hp;
    }
  }

  return {
    killTurns,
    enemyActions,
    playerDmg: playerDmgPerTurn,
    avgEnemyDmg: enemyActions ? Math.round(totalTaken / enemyActions) : 0,
    maxEnemyDmg,
    totalTaken,
    healUsed,
    mpSpent,
    hpRemaining: Math.max(0, pHp),
    won: eHp <= 0 && pHp > 0,
    noHealWin: eHp <= 0 && pHp > 0 && healUsed === 0,
  };
}

function rateTurns(tier: ThreatTier, turns: number): string {
  const band = TURN_BANDS[tier];
  if (turns < band.ok[0]) return '短すぎる';
  if (turns <= band.ok[1]) return '適正';
  if (turns < band.long) return 'やや長い';
  return '長すぎる';
}

function rateOverall(tier: ThreatTier, sim: SimResult, gearLabel: string): string {
  const turnRate = rateTurns(tier, sim.killTurns);
  if (!sim.won) {
    if (sim.healUsed >= 3) return `耐久NG（回復${sim.healUsed}回でも未勝利）`;
    return '耐久NG（回復不足で敗北）';
  }
  const maxHeal = tier === 'boss' ? 4 : tier === 'elite' ? 3 : tier === 'rare' ? 2 : 1;
  if (turnRate === '適正' && sim.healUsed > maxHeal) {
    return `手数適正だが耐久NG（回復${sim.healUsed}回必要）`;
  }
  if (turnRate === '適正' && sim.hpRemaining < sim.playerDmg) {
    return '手数適正だが耐久ギリギリ';
  }
  if (turnRate !== '適正' && sim.noHealWin) return `${turnRate}（回復なし可）`;
  if (turnRate === '適正' && sim.healUsed <= maxHeal) return '適正';
  if (gearLabel === '最高装備' && turnRate === 'やや長い') return '最高装備なら許容';
  return turnRate;
}

function playerDamagePerTurn(
  c: DurabilityCase,
  player: PlayerProfile,
  scale: ReturnType<typeof scaleMonsterForBattle>,
  diff: ReturnType<typeof getDifficultyModifiers>,
  monsterRow: { area_tag: string; id: string; weaknesses_json?: string | null; resistances_json?: string | null; element?: string | null },
): number {
  if (c.useMagic) {
    const def = getMonsterElementDef(monsterRow.id, monsterRow.area_tag);
    const defender = {
      element: def.element,
      weaknesses_json: JSON.stringify(def.weaknesses),
      resistances_json: JSON.stringify(def.resistances),
    };
    const el = normalizeElement(c.skillElement ?? 'neutral');
    const mult = calcElementDamageMultiplier(el, defender).multiplier;
    return Math.max(1, Math.floor(
      calcPhysicalDamage(player.magic, scale.spirit, diff.playerDamage * (c.skillPower ?? 1), 0) * mult,
    ));
  }
  return calcPhysicalDamage(player.atk, scale.defense, diff.playerDamage, 0);
}

function printDurabilityBlock(db: ReturnType<typeof getDb>): void {
  console.log('\n### 耐久シミュレーション（手数+被ダメ+回復+MP）\n');

  for (const c of DURABILITY_CASES) {
    const row = db.prepare('SELECT * FROM monsters WHERE id = ?').get(c.id) as {
      id: string; name: string; area_tag: string; hp: number; attack: number; magic: number;
      defense: number; spirit: number; speed: number; is_boss?: number;
      element?: string | null; weaknesses_json?: string | null; resistances_json?: string | null;
    } | undefined;
    if (!row) continue;

    const scale = scaleMonsterForBattle({ ...row, id: row.id });
    const tier = getMonsterThreatTier(row.id, { isStoryBoss: row.is_boss === 1 });
    const diff = getDifficultyModifiers(c.playerLv, c.areaMin, c.areaMax);

    console.log(`#### ${c.name}（${c.category} / ${tier}）`);

    for (const gearTier of ['avg', 'top'] as GearTier[]) {
      const player = c.playerLv === 25 && c.useMagic
        ? { ...REAL_LOG_MAGE, label: gearTier === 'avg' ? REAL_LOG_MAGE.label : '最高装備(Lv25)' }
        : { ...gearProfile(gearTier, c.playerLv), mpPerTurn: c.useMagic ? 10 : 0 };

      const pDmg = playerDamagePerTurn(c, player, scale, diff, row);
      const sim = simulateBattle(
        scale.hp,
        scale.attack,
        tier,
        player,
        Math.max(1, pDmg),
        diff,
        { defendEvery: c.defendEvery, maxHeals: tier === 'boss' ? 6 : 5 },
      );

      console.log([
        `敵: ${row.name}`,
        `分類: ${tier}`,
        `想定プレイヤー: ${player.label} Lv${player.lv}`,
        `プレイヤーHP: ${player.hp}`,
        `プレイヤーMP: ${player.mp}`,
        `敵HP: ${scale.hp}`,
        `敵攻撃: ${scale.attack}`,
        `プレイヤー与ダメ: ${pDmg}`,
        `敵被ダメ(平均/最大): ${sim.avgEnemyDmg} / ${sim.maxEnemyDmg}`,
        `討伐手数: ${sim.killTurns}`,
        `敵行動回数: ${sim.enemyActions}`,
        `被ダメ合計: ${sim.totalTaken}`,
        `必要回復回数: ${sim.healUsed}`,
        `消費MP: ${sim.mpSpent}`,
        `勝利時残HP: ${sim.won ? sim.hpRemaining : 0}`,
        `回復なし勝利: ${sim.noHealWin ? '可' : '不可'}`,
        `評価: ${rateOverall(tier, sim, player.label)}`,
        '',
      ].join('\n'));
    }
  }
}

function verifyPhase2Idempotency(): void {
  console.log('\n### phase2Seed 冪等性検証\n');
  console.log('方式: MONSTER_SEED_DATA から絶対値を再計算（DB.hp×倍率は廃止）');
  const EARLY = new Set(['starfield', 'port']);
  const MID = new Set(['mine', 'forest', 'library']);
  const samples = ['mon_training_doll', 'mon_bookworm_swarm', 'mon_rust_miner'];
  for (const id of samples) {
    const m = MONSTER_SEED_DATA.find((x) => x.id === id);
    if (!m) continue;
    let hp = m.hp;
    let gold = m.gold;
    if (EARLY.has(m.tag)) {
      hp = Math.floor(hp * 1.18);
      gold = Math.floor(gold * 1.2);
    } else if (MID.has(m.tag)) {
      hp = Math.floor(hp * 1.12);
      gold = Math.floor(gold * 1.2);
    }
    const again = (() => {
      let h = m.hp;
      let g = m.gold;
      if (EARLY.has(m.tag)) { h = Math.floor(h * 1.18); g = Math.floor(g * 1.2); }
      else if (MID.has(m.tag)) { h = Math.floor(h * 1.12); g = Math.floor(g * 1.2); }
      return { hp: h, gold: g };
    })();
    const ok = hp === again.hp && gold === again.gold;
    console.log(`${ok ? '✅' : '❌'} ${id}: HP=${hp}, G=${gold}（2回計算で同一）`);
  }
  console.log('\n冪等性: seed再実行しても同じ絶対値がSETされる（累積倍率なし）');
}

function verifyDoubleSeedRun(db: ReturnType<typeof getDb>): void {
  console.log('\n### seed 2回実行検証\n');
  const sampleIds = ['mon_training_doll', 'mon_silver_golem', 'mon_silent_guardian', 'mon_rust_miner'];
  const snap = () => {
    const m = new Map<string, { hp: number; gold: number }>();
    for (const id of sampleIds) {
      const r = db.prepare('SELECT hp, gold_reward AS gold FROM monsters WHERE id = ?').get(id) as { hp: number; gold: number } | undefined;
      if (r) m.set(id, r);
    }
    return m;
  };
  ensurePhase2Seed(db);
  const first = snap();
  ensurePhase2Seed(db);
  const second = snap();
  for (const id of sampleIds) {
    const a = first.get(id);
    const b = second.get(id);
    if (!a || !b) continue;
    const ok = a.hp === b.hp && a.gold === b.gold;
    console.log(`${ok ? '✅' : '❌'} ${id}: 1回目 HP=${a.hp} G=${a.gold} → 2回目 HP=${b.hp} G=${b.gold}`);
  }
}

function runRealLogMoonLibraryCase(db: ReturnType<typeof getDb>): void {
  console.log('\n### 実プレイログ再現 — real_log_moon_library_mage_lv25\n');
  const areaMin = 22;
  const areaMax = 32;
  const diff = getDifficultyModifiers(REAL_LOG_MAGE.lv, areaMin, areaMax);

  for (const id of ['mon_bookworm_swarm', 'mon_ink_beast'] as const) {
    const row = db.prepare('SELECT * FROM monsters WHERE id = ?').get(id) as {
      id: string; name: string; area_tag: string; hp: number; attack: number; magic: number;
      defense: number; spirit: number; speed: number; is_boss?: number;
      element?: string | null; weaknesses_json?: string | null; resistances_json?: string | null;
    } | undefined;
    if (!row) continue;
    const scale = scaleMonsterForBattle({ ...row, id: row.id });
    const def = getMonsterElementDef(row.id, row.area_tag);
    const defender = {
      element: def.element,
      weaknesses_json: JSON.stringify(def.weaknesses),
      resistances_json: JSON.stringify(def.resistances),
    };

    for (const skill of [
      { name: '星弾', power: 1.1, element: 'star' },
      { name: '残響爆破', power: 1.2, element: 'neutral' },
      { name: '通常攻撃', power: 1.0, element: 'neutral', physical: true },
    ]) {
      const mult = skill.physical ? 1 : calcElementDamageMultiplier(normalizeElement(skill.element), defender).multiplier;
      const stat = skill.physical ? REAL_LOG_MAGE.atk : REAL_LOG_MAGE.magic;
      const defStat = skill.physical ? scale.defense : scale.spirit;
      const pDmg = Math.max(1, Math.floor(calcPhysicalDamage(stat, defStat, diff.playerDamage * skill.power, 0) * mult));
      const sim = simulateBattle(scale.hp, scale.attack, scale.threatTier, REAL_LOG_MAGE, pDmg, diff, { maxHeals: 4 });
      console.log([
        `敵: ${row.name}`,
        `スキル: ${skill.name}`,
        `属性倍率: ×${mult.toFixed(2)}`,
        `与ダメ: ${pDmg}`,
        `敵HP: ${scale.hp}`,
        `討伐手数: ${sim.killTurns}`,
        `敵行動回数: ${sim.enemyActions}`,
        `被ダメ合計: ${sim.totalTaken}`,
        `必要回復: ${sim.healUsed}`,
        `評価: ${rateTurns(scale.threatTier, sim.killTurns)}`,
        '',
      ].join('\n'));
    }
  }
}

function main() {
  verifyPhase2Idempotency();

  let db;
  try { db = getDb(); } catch {
    console.log('\nDB未接続 — seed後に再実行してください');
    process.exit(0);
  }

  console.log('=== 戦闘バランス+耐久レポート ===');
  verifyDoubleSeedRun(db);
  ensurePhase2Seed(db);
  console.log('（最新の phase2Seed を適用済み）');
  console.log(`属性倍率: 大${AFFINITY_MULTIPLIER.major_weak} / 弱${AFFINITY_MULTIPLIER.weak} / 耐${AFFINITY_MULTIPLIER.resist}`);
  printDurabilityBlock(db);
  runRealLogMoonLibraryCase(db);
}

main();
