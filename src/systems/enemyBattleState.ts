/**
 * Phase4: 複数敵戦闘状態 — battle_sessions.enemy_state_json と legacy 互換。
 */
import { getDb } from '../db/database';
import {
  scaleMonsterForBattle,
  getMonsterThreatTier,
  type ScaledMonster,
  type ThreatTier,
} from './combatMath';
import {
  perEnemyAttackMult,
  perEnemyHpMult,
  encounterRewardMult,
  toughPackAttackPenalty,
  type EncounterSize,
} from './multiEncounter';

export type EnemyInstanceStatus = {
  bind?: number;
  slow?: number;
  poisonTurns?: number;
};

export type EnemyInstance = {
  instance_id: string;
  label: string;
  monster_id: string;
  name: string;
  hp: number;
  max_hp: number;
  break: number;
  break_max: number;
  is_alive: boolean;
  position: number;
  status: EnemyInstanceStatus;
  combatScale: ScaledMonster;
  threatTier: ThreatTier;
};

export type EnemyStateJson = {
  version: 1;
  enemies: EnemyInstance[];
  partySize: EncounterSize;
  perEnemyAtkMult: number;
  perEnemyHpMult: number;
  rewardMult: number;
  toughPenalty: number;
  areaRank: number;
};

const LABELS = ['A', 'B', 'C'];

type MonsterRow = {
  id: string; name: string; level: number; attack: number; magic: number; defense: number;
  spirit: number; speed: number; break_max: number; hp: number; area_tag?: string; is_boss?: number;
};

export function buildEnemyStateFromMonsters(
  monsterIds: string[],
  areaId: string | null,
  opts?: { isBoss?: boolean; isStoryBoss?: boolean; areaRank?: number },
): EnemyStateJson {
  const db = getDb();
  const partySize = Math.min(3, Math.max(1, monsterIds.length)) as EncounterSize;
  const areaRank = opts?.areaRank ?? 1;
  const threats = monsterIds.map((id) => getMonsterThreatTier(id, { forceBoss: opts?.isBoss }));
  const hasRareOrElite = threats.some((t) => t === 'rare' || t === 'elite');
  const toughCount = threats.filter((t) => t === 'tough').length;
  const atkMult = perEnemyAttackMult(partySize, areaRank);
  const hpMult = perEnemyHpMult(partySize);
  const rewardMult = encounterRewardMult(partySize, hasRareOrElite);
  const toughPenalty = toughPackAttackPenalty(toughCount, partySize);

  const enemies: EnemyInstance[] = monsterIds.slice(0, 3).map((monsterId, idx) => {
    const monster = db.prepare('SELECT * FROM monsters WHERE id = ?').get(monsterId) as MonsterRow;
    if (!monster) throw new Error(`Monster not found: ${monsterId}`);
    const scaled = scaleMonsterForBattle(
      { ...monster, id: monsterId, area_tag: monster.area_tag ?? 'starfield' },
      { forceBoss: opts?.isBoss, isStoryBoss: opts?.isStoryBoss },
    );
    const maxHp = Math.max(1, Math.floor(scaled.hp * (partySize > 1 ? hpMult : 1)));
    return {
      instance_id: `enemy_${idx + 1}`,
      label: LABELS[idx] ?? String(idx + 1),
      monster_id: monsterId,
      name: monster.name,
      hp: maxHp,
      max_hp: maxHp,
      break: 0,
      break_max: monster.break_max,
      is_alive: true,
      position: idx,
      status: {},
      combatScale: {
        ...scaled,
        attack: Math.floor(scaled.attack * atkMult * toughPenalty),
        magic: Math.floor(scaled.magic * atkMult * toughPenalty),
        hp: maxHp,
      },
      threatTier: scaled.threatTier,
    };
  });

  return {
    version: 1,
    enemies,
    partySize,
    perEnemyAtkMult: atkMult,
    perEnemyHpMult: hpMult,
    rewardMult,
    toughPenalty,
    areaRank,
  };
}

/** legacy 単体カラムから復元 */
export function enemyStateFromLegacy(
  monsterId: string,
  enemyHp: number,
  enemyBreak: number,
  combatScale?: ScaledMonster,
): EnemyStateJson {
  const db = getDb();
  const monster = db.prepare('SELECT * FROM monsters WHERE id = ?').get(monsterId) as MonsterRow;
  if (!monster) throw new Error('Monster not found');
  const scaled = combatScale ?? scaleMonsterForBattle(
    { ...monster, id: monsterId, area_tag: monster.area_tag ?? 'starfield' },
  );
  const maxHp = scaled.hp;
  return {
    version: 1,
    enemies: [{
      instance_id: 'enemy_1',
      label: 'A',
      monster_id: monsterId,
      name: monster.name,
      hp: Math.min(Math.max(0, enemyHp), maxHp),
      max_hp: maxHp,
      break: enemyBreak,
      break_max: monster.break_max,
      is_alive: enemyHp > 0,
      position: 0,
      status: {},
      combatScale: scaled,
      threatTier: scaled.threatTier,
    }],
    partySize: 1,
    perEnemyAtkMult: 1,
    perEnemyHpMult: 1,
    rewardMult: 1,
    toughPenalty: 1,
    areaRank: 1,
  };
}

export function parseEnemyStateJson(raw: string | null | undefined): EnemyStateJson | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as EnemyStateJson;
    if (parsed?.version === 1 && Array.isArray(parsed.enemies)) return parsed;
  } catch { /* ignore */ }
  return null;
}

export function loadEnemyState(session: {
  monster_id: string;
  enemy_hp: number;
  enemy_break: number;
  enemy_state_json?: string | null;
  status_json: string;
}): EnemyStateJson {
  const fromJson = parseEnemyStateJson(session.enemy_state_json ?? null);
  if (fromJson) return fromJson;
  let combatScale: ScaledMonster | undefined;
  try {
    const state = JSON.parse(session.status_json) as { combatScale?: ScaledMonster };
    combatScale = state.combatScale;
  } catch { /* ignore */ }
  return enemyStateFromLegacy(session.monster_id, session.enemy_hp, session.enemy_break, combatScale);
}

export function syncLegacyEnemyColumns(enemyState: EnemyStateJson): {
  monster_id: string;
  enemy_hp: number;
  enemy_break: number;
} {
  const primary = enemyState.enemies.find((e) => e.is_alive) ?? enemyState.enemies[0];
  if (!primary) {
    return { monster_id: '', enemy_hp: 0, enemy_break: 0 };
  }
  return {
    monster_id: primary.monster_id,
    enemy_hp: primary.hp,
    enemy_break: primary.break,
  };
}

export function getAliveEnemies(state: EnemyStateJson): EnemyInstance[] {
  return state.enemies.filter((e) => e.is_alive && e.hp > 0);
}

export function allEnemiesDefeated(state: EnemyStateJson): boolean {
  return getAliveEnemies(state).length === 0;
}

export function getEnemyByInstanceId(state: EnemyStateJson, instanceId: string): EnemyInstance | undefined {
  return state.enemies.find((e) => e.instance_id === instanceId);
}

export function formatEnemyDisplayName(enemy: EnemyInstance, partySize = 1): string {
  if (partySize <= 1) return enemy.name;
  return `${enemy.label}: ${enemy.name}`;
}

export function serializeEnemyState(state: EnemyStateJson): string {
  return JSON.stringify(state);
}

/** 同一ターンに全敵が重火力技を使わない — 重攻撃フラグ */
export function pickEnemyHeavyFlags(enemies: EnemyInstance[]): boolean[] {
  const flags = enemies.map((e) => {
    const ai = { heavy_chance: 0.15 };
    void ai;
    return e.threatTier === 'elite' || (e.threatTier === 'tough' && Math.random() < 0.25);
  });
  const heavyCount = flags.filter(Boolean).length;
  if (heavyCount <= 1 || enemies.length <= 1) return flags;
  let kept = false;
  return flags.map((f) => {
    if (!f) return false;
    if (!kept) { kept = true; return true; }
    return false;
  });
}
