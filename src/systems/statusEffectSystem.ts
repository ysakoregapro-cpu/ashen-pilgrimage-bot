import type { StatusEffectKey } from '../db/seedData/skillEffectMaster';

export type BattleStatusState = {
  poisonTurns: number;
  burnTurns: number;
  playerSilence: number;
  playerBlind: number;
  playerBind: number;
  playerRegen: number;
  enemyPoison: number;
  enemyBurn: number;
  enemySlow: number;
  enemyBind: number;
  enemySilence: number;
  enemyDefDown: number;
  enemyAtkDown: number;
  enemyMagDown: number;
  enemySpiDown: number;
  enemyVulnerable: number;
  playerDefDown: number;
  playerDefUp: number;
};

export const DEFAULT_STATUS_STATE: BattleStatusState = {
  poisonTurns: 0, burnTurns: 0, playerSilence: 0, playerBlind: 0, playerBind: 0, playerRegen: 0,
  enemyPoison: 0, enemyBurn: 0, enemySlow: 0, enemyBind: 0, enemySilence: 0,
  enemyDefDown: 0, enemyAtkDown: 0, enemyMagDown: 0, enemySpiDown: 0,
  enemyVulnerable: 0, playerDefDown: 0, playerDefUp: 0,
};

export function mergeStatusState(existing: Partial<BattleStatusState>): BattleStatusState {
  return { ...DEFAULT_STATUS_STATE, ...existing };
}

export function applyStatusEffect(
  state: BattleStatusState,
  target: 'player' | 'enemy',
  effect: StatusEffectKey,
  duration: number,
  isBoss: boolean,
): string {
  const dur = Math.max(1, duration);
  switch (effect) {
    case 'poison':
      if (target === 'player') state.poisonTurns = Math.max(state.poisonTurns, dur);
      else state.enemyPoison = Math.max(state.enemyPoison, dur);
      return '毒が蔓延した。';
    case 'burn':
      if (target === 'enemy') { state.enemyBurn = Math.max(state.enemyBurn, dur); return '燃焼した。'; }
      return '';
    case 'slow':
      state.enemySlow += 3 + dur;
      return '足が止まった。';
    case 'bind':
      if (isBoss) {
        state.enemyVulnerable = Math.max(state.enemyVulnerable, dur);
        state.enemySlow += 2;
        return '光の繋ぎが敵の動きを鈍らせた。';
      }
      state.enemyBind = Math.max(state.enemyBind, dur);
      return '拘束した！';
    case 'silence':
      if (isBoss) { state.enemyVulnerable = Math.max(state.enemyVulnerable, 1); return '沈黙の加護が効きにくい……弱体化した。'; }
      if (target === 'player') state.playerSilence = Math.max(state.playerSilence, dur);
      else state.enemySilence = Math.max(state.enemySilence, dur);
      return '沈黙が降りる。';
    case 'blind':
      state.playerBlind = Math.max(state.playerBlind, dur);
      return '視界が曇った。';
    case 'defense_down':
      state.enemyDefDown = Math.max(state.enemyDefDown, dur);
      return '防御が削がれた。';
    case 'attack_down':
      state.enemyAtkDown = Math.max(state.enemyAtkDown, dur);
      return '攻撃力が落ちた。';
    case 'magic_down':
      state.enemyMagDown = Math.max(state.enemyMagDown, dur);
      return isBoss ? '魔力が削がれた（ボス効果）。' : '魔力が削がれた。';
    case 'spirit_down':
      state.enemySpiDown = Math.max(state.enemySpiDown, dur);
      return isBoss ? '精神が揺らいだ（ボス効果）。' : '精神が揺らいだ。';
    case 'guard_up':
      if (target === 'player') {
        state.playerDefUp = Math.max(state.playerDefUp, dur);
        return '防御が高まった。';
      }
      return '';
    case 'vulnerable':
      state.enemyVulnerable = Math.max(state.enemyVulnerable, dur);
      return '被ダメージが増えやすくなった。';
    case 'regen':
      state.playerRegen = Math.max(state.playerRegen, dur);
      return '継続回復が働く。';
    default:
      return '';
  }
}

export function tickStatusEffects(
  state: BattleStatusState,
  pHp: number,
  pMaxHp: number,
  eHp: number,
  monsterName: string,
  isBoss: boolean,
): { pHp: number; eHp: number; logs: string[] } {
  const logs: string[] = [];

  if (state.poisonTurns > 0 && pHp > 0) {
    const dmg = Math.max(2, Math.floor(pMaxHp * 0.04));
    pHp -= dmg;
    state.poisonTurns--;
    logs.push(`毒が蝕む。\n　あなたに **${dmg}** ダメージ。`);
  }
  if (state.enemyPoison > 0 && eHp > 0) {
    const dmg = Math.max(3, Math.floor(eHp * 0.05));
    eHp -= dmg;
    state.enemyPoison--;
    logs.push(`毒が蝕む。\n　${monsterName}に **${dmg}** ダメージ。`);
  }
  if (state.enemyBurn > 0 && eHp > 0) {
    const dmg = Math.max(4, Math.floor(eHp * 0.06));
    eHp -= dmg;
    state.enemyBurn--;
    state.enemyDefDown = Math.max(state.enemyDefDown, 1);
    logs.push(`燃焼が続く。\n　${monsterName}に **${dmg}** ダメージ。`);
  }
  if (state.playerRegen > 0 && pHp > 0) {
    const heal = Math.max(3, Math.floor(pMaxHp * 0.05));
    pHp = Math.min(pMaxHp, pHp + heal);
    state.playerRegen--;
    logs.push(`灯火が体を癒す。\n　HP **+${heal}**。`);
  }

  if (state.enemyBind > 0) state.enemyBind--;
  if (state.playerBind > 0) state.playerBind--;
  if (state.playerSilence > 0) state.playerSilence--;
  if (state.playerBlind > 0) state.playerBlind--;
  if (state.enemyDefDown > 0) state.enemyDefDown--;
  if (state.enemyAtkDown > 0) state.enemyAtkDown--;
  if (state.enemyMagDown > 0) state.enemyMagDown--;
  if (state.enemySpiDown > 0) state.enemySpiDown--;
  if (state.enemyVulnerable > 0) state.enemyVulnerable--;
  if (state.playerDefUp > 0) state.playerDefUp--;

  return { pHp, eHp, logs };
}

export function isEnemyActionBlocked(state: BattleStatusState, isBoss: boolean): boolean {
  if (isBoss) return false;
  return state.enemyBind > 0;
}

export function isPlayerActionBlocked(state: BattleStatusState): boolean {
  return state.playerBind > 0;
}

export function getDefensiveModifiers(state: BattleStatusState, isBoss: boolean): {
  enemyDefMult: number; enemyAtkMult: number; enemyMagMult: number; playerTakenMult: number; hitPenalty: number;
} {
  let enemyDefMult = 1;
  let enemyAtkMult = 1;
  let enemyMagMult = 1;
  let playerTakenMult = 1;
  let hitPenalty = 0;

  if (state.enemyDefDown > 0) enemyDefMult *= 0.85;
  if (state.enemyAtkDown > 0) enemyAtkMult *= 0.85;
  if (state.enemyMagDown > 0) enemyMagMult *= isBoss ? 0.9 : 0.85;
  if (state.enemySpiDown > 0) enemyMagMult *= isBoss ? 0.92 : 0.88;
  if (state.enemyVulnerable > 0) enemyDefMult *= isBoss ? 0.92 : 0.8;
  if (state.playerBlind > 0) hitPenalty -= 0.15;
  if (state.playerDefDown > 0) playerTakenMult *= 1.1;
  if (state.playerDefUp > 0) playerTakenMult *= 0.9;

  return { enemyDefMult, enemyAtkMult, enemyMagMult, playerTakenMult, hitPenalty };
}
