import type { StatusEffectKey } from '../db/seedData/skillEffectMaster';
import type { ThreatTier } from './combatMath';
import { roll, randomInt } from '../utils/random';

export type StatusAttemptKey = 'bind' | 'slow' | 'stun' | 'freeze' | 'sleep' | 'poison' | 'burn' | 'silence' | 'blind';

export type StatusAttemptCounts = Record<StatusAttemptKey, number>;

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
  statusAttempts: StatusAttemptCounts;
  statusSuccesses: StatusAttemptCounts;
  controlImmunityTurns: number;
  /** Enemy's next attack deals less damage to player (0–0.2) */
  enemyNextAtkReducePct: number;
  enemyNextAtkReduceActive: boolean;
};

const EMPTY_ATTEMPTS = (): StatusAttemptCounts => ({
  bind: 0, slow: 0, stun: 0, freeze: 0, sleep: 0, poison: 0, burn: 0, silence: 0, blind: 0,
});

export const DEFAULT_STATUS_STATE: BattleStatusState = {
  poisonTurns: 0, burnTurns: 0, playerSilence: 0, playerBlind: 0, playerBind: 0, playerRegen: 0,
  enemyPoison: 0, enemyBurn: 0, enemySlow: 0, enemyBind: 0, enemySilence: 0,
  enemyDefDown: 0, enemyAtkDown: 0, enemyMagDown: 0, enemySpiDown: 0,
  enemyVulnerable: 0, playerDefDown: 0, playerDefUp: 0,
  statusAttempts: EMPTY_ATTEMPTS(),
  statusSuccesses: EMPTY_ATTEMPTS(),
  controlImmunityTurns: 0,
  enemyNextAtkReducePct: 0,
  enemyNextAtkReduceActive: false,
};

export const DEFAULT_STATUS_SUCCESS_RATES: Record<StatusAttemptKey, number> = {
  bind: 0.55,
  slow: 0.70,
  blind: 0.65,
  poison: 0.75,
  burn: 0.70,
  silence: 0.60,
  stun: 0.50,
  freeze: 0.50,
  sleep: 0.45,
};

const TIER_STATUS_MODIFIERS: Record<ThreatTier, number> = {
  normal: 1.0,
  tough: 0.9,
  rare: 0.85,
  elite: 0.7,
  boss: 1.0,
};

const REPEAT_ATTEMPT_MODIFIERS = [1.0, 0.6, 0.35, 0.2];

const FULL_CONTROL_EFFECTS = new Set<string>(['bind', 'stun', 'freeze', 'sleep']);

const FAIL_LOGS: Partial<Record<StatusAttemptKey, string>> = {
  bind: 'しかし拘束は振りほどかれた。',
  slow: 'しかし鈍足は効かなかった。',
  stun: 'しかしスタンは効かなかった。',
  freeze: 'しかし凍結は防がれた。',
  sleep: 'しかし眠りは誘えなかった。',
  poison: 'しかし毒は効かなかった。',
  burn: 'しかし火傷は付かなかった。',
  silence: 'しかし沈黙は届かなかった。',
  blind: 'しかし暗闇は効かなかった。',
};

export function mergeStatusState(existing: Partial<BattleStatusState>): BattleStatusState {
  return {
    ...DEFAULT_STATUS_STATE,
    ...existing,
    statusAttempts: { ...EMPTY_ATTEMPTS(), ...existing.statusAttempts },
    statusSuccesses: { ...EMPTY_ATTEMPTS(), ...existing.statusSuccesses },
  };
}

export function isFullControlEffect(effect: StatusEffectKey | string): boolean {
  return FULL_CONTROL_EFFECTS.has(effect);
}

export function toStatusAttemptKey(effect: StatusEffectKey | string): StatusAttemptKey {
  if (effect === 'stun' || effect === 'freeze' || effect === 'sleep') return effect;
  if (effect === 'bind') return 'bind';
  if (effect === 'slow') return 'slow';
  if (effect === 'poison') return 'poison';
  if (effect === 'burn') return 'burn';
  if (effect === 'silence') return 'silence';
  if (effect === 'blind') return 'blind';
  return 'slow';
}

export function calcStatusSuccessRate(
  state: BattleStatusState,
  effect: StatusEffectKey | string,
  threatTier: ThreatTier,
  skillSuccessRate?: number,
): number {
  const key = toStatusAttemptKey(effect);
  const base = skillSuccessRate ?? DEFAULT_STATUS_SUCCESS_RATES[key];
  const tierMod = TIER_STATUS_MODIFIERS[threatTier];
  const attemptIdx = state.statusAttempts[key] ?? 0;
  const repeatMod = REPEAT_ATTEMPT_MODIFIERS[Math.min(attemptIdx, REPEAT_ATTEMPT_MODIFIERS.length - 1)]!;
  const minRate = threatTier === 'elite' || threatTier === 'boss' ? 0.05 : 0.10;
  return Math.max(minRate, base * tierMod * repeatMod);
}

export type StatusApplyResult = {
  success: boolean;
  breakBonus: number;
  logs: string[];
  fullControlApplied: boolean;
};

function applyWeakenedControl(
  state: BattleStatusState,
  effect: StatusEffectKey | string,
  isBoss: boolean,
  immunity: boolean,
): StatusApplyResult {
  const breakBonus = randomInt(10, 20);
  state.enemySlow += 2;
  state.enemyVulnerable = Math.max(state.enemyVulnerable, 1);
  state.enemyNextAtkReducePct = 0.15;
  state.enemyNextAtkReduceActive = true;

  const logs: string[] = [];
  if (immunity) {
    if (effect === 'bind' || effect === 'stun' || effect === 'freeze') {
      logs.push('敵は拘束に慣れつつある。');
    } else {
      logs.push('敵は状態異常に慣れつつある。');
    }
  } else if (isBoss) {
    const bossMsgs = [
      '拘束は完全には届かなかったが、体勢を崩した。',
      '敵は拘束を振りほどいた。\n　しかし動きが鈍った。',
    ];
    logs.push(bossMsgs[randomInt(0, bossMsgs.length - 1)]!);
    logs.push(`ブレイク **+${breakBonus}**`);
  }

  if (state.controlImmunityTurns > 0) {
    state.controlImmunityTurns = 0;
  }

  return { success: true, breakBonus, logs, fullControlApplied: false };
}

function applyBossControlConversion(state: BattleStatusState): StatusApplyResult {
  const breakBonus = randomInt(15, 25);
  const useSlow = roll(0.5);
  if (useSlow) {
    state.enemySlow += 3;
  } else {
    state.enemyVulnerable = Math.max(state.enemyVulnerable, 1);
    state.enemyAtkDown = Math.max(state.enemyAtkDown, 1);
    state.enemyNextAtkReducePct = randomInt(10, 20) / 100;
    state.enemyNextAtkReduceActive = true;
  }

  const logs = [
    roll(0.5)
      ? '拘束は完全には届かなかったが、体勢を崩した。'
      : '敵は拘束を振りほどいた。\n　しかし動きが鈍った。',
    `ブレイク **+${breakBonus}**`,
  ];

  return { success: true, breakBonus, logs, fullControlApplied: false };
}

/** Roll-based enemy status application with tier / repeat / immunity / boss rules */
export function attemptApplyEnemyStatus(opts: {
  state: BattleStatusState;
  effect: StatusEffectKey;
  duration: number;
  isBoss: boolean;
  threatTier: ThreatTier;
  skillSuccessRate?: number;
  monsterName?: string;
  rollValue?: number;
}): StatusApplyResult {
  const { state, effect, duration, isBoss, threatTier, skillSuccessRate } = opts;
  const key = toStatusAttemptKey(effect);
  state.statusAttempts[key] = (state.statusAttempts[key] ?? 0) + 1;

  const rate = calcStatusSuccessRate(state, effect, threatTier, skillSuccessRate);
  const passed = opts.rollValue !== undefined ? opts.rollValue < rate : roll(rate);

  if (!passed) {
    return {
      success: false,
      breakBonus: 0,
      logs: [FAIL_LOGS[key] ?? '状態異常は効かなかった。'],
      fullControlApplied: false,
    };
  }

  state.statusSuccesses[key] = (state.statusSuccesses[key] ?? 0) + 1;
  const fullControl = isFullControlEffect(effect);

  if (isBoss && fullControl) {
    return applyBossControlConversion(state);
  }

  if (fullControl && state.controlImmunityTurns > 0) {
    return applyWeakenedControl(state, effect, false, true);
  }

  const msg = applyStatusEffect(state, 'enemy', effect, duration, isBoss);
  const logs = msg ? [msg] : [];

  return {
    success: true,
    breakBonus: 0,
    logs,
    fullControlApplied: fullControl && state.enemyBind > 0,
  };
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

export function onEnemyControlBlocked(state: BattleStatusState): void {
  state.controlImmunityTurns = 1;
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

export function getEnemyAttackReduceMult(state: BattleStatusState): number {
  if (!state.enemyNextAtkReduceActive || state.enemyNextAtkReducePct <= 0) return 1;
  return 1 - state.enemyNextAtkReducePct;
}

export function consumeEnemyAttackReduce(state: BattleStatusState): void {
  state.enemyNextAtkReduceActive = false;
  state.enemyNextAtkReducePct = 0;
}
