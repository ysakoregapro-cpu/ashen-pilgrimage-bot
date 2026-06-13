import { getDb } from '../db/database';
import { getDifficultyModifiers } from './difficultySystem';
import { calcBattleExp, calcBossExp } from './expSystem';
import { SRC_FORGE_MATERIAL_ID, SRC_FORGE_MATERIAL_DROP_RATE } from '../db/seedData/awakeningMaster';
import { BOSS_VICTORY_MATERIAL_DROPS } from '../db/seedData/dropBalanceMaster';
import {
  REMATCH_MATERIAL_BOSSES, UNI_FORGE_DROP_RATE, SRC_FARM_MONSTER_IDS, PHASE2_UNI_MATERIAL_DROPS,
} from '../db/seedData/forgeMaster';
import { calcElementDamageMultiplier, applyElementToDamage, resolveAttackElement, getPlayerElementResistances, applyPlayerElementResist } from './elementSystem';
import {
  applyStatusEffect, attemptApplyEnemyStatus, tickStatusEffects, isEnemyActionBlocked,
  isPlayerActionBlocked, onEnemyControlBlocked, getDefensiveModifiers, mergeStatusState,
  getEnemyAttackReduceMult, consumeEnemyAttackReduce, type BattleStatusState,
} from './statusEffectSystem';
import type { StatusEffectKey } from '../db/seedData/skillEffectMaster';
import { resolveSkillEffect } from '../db/seedData/skillEffectMaster';
import { addExp, addGold, requirePlayer, recalculatePlayerStats } from './playerSystem';
import { addItem } from './inventorySystem';
import { applyDefeat, applyTrialDefeat } from './defeatSystem';
import { incrementWeeklyProgress } from './weeklySystem';
import { getUsableBattleSkills, isUsableBattleSkill, skillTypeLabel, scalingLabel, type SkillRow } from './skillSystem';
import { grantBattleJobExp, getJobProgressText } from './jobLevelSystem';
import { afterJobExpGranted } from './jobProgressionSystem';
import { handleTrialVictory, isTrialBattleSession, parseTrialBaseJob } from './trialBattleSystem';
import { roll, uuid, randomInt, weightedChoice } from '../utils/random';
import {
  getAreaLootTier, rollBattleEquipmentRarity, resolveEquipSlot, pickEquipmentFromAreaPool,
  pickMaterialFromPool, pickHighMaterialFromPool, rollRematchGenericLoot,
  type BattleThreatTier,
} from './equipmentDropSystem';
import { nowIso, type BattleStatus } from '../types';
import { formatBattleLine, type BattleLogType } from '../utils/formatters';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { battleButtons, battleEmbed, battleEmbedMulti, selectMenu } from '../utils/embeds';
import {
  scaleMonsterForBattle, calcPhysicalDamage, calcEnemyDamageToPlayer,
  getThreatLabel, type ScaledMonster,
} from './combatMath';
import { getBattleRewardMultipliers } from './enemyBalanceV2';
import {
  buildEnemyStateFromMonsters,
  loadEnemyState,
  syncLegacyEnemyColumns,
  getAliveEnemies,
  allEnemiesDefeated,
  getEnemyByInstanceId,
  formatEnemyDisplayName,
  serializeEnemyState,
  pickEnemyHeavyFlags,
  type EnemyStateJson,
  type EnemyInstance,
} from './enemyBattleState';
import { getAreaRank } from './townLootSystem';
import { AOE_DAMAGE_MULT } from './skillBattleCore';
import { buildEffectiveRewardPool } from './townLootSystem';
import {
  loadBattleStatusFromPlayer,
  persistPlayerPoisonFromBattle,
  syncBattleResourcesToPlayer,
  syncBattleStatusToPlayer,
} from './playerStatusSystem';

export interface BattleState extends BattleStatusState {
  defending: boolean;
  enemyBroken: boolean;
  breakRemainingHits: number;
  playerBreakDamageMult: number;
  usedRevive: boolean;
  log: string[];
  tutorialBattle?: boolean;
  fleeBonus: number;
  atkBuff: number;
  magBuff: number;
  defBuff: number;
  trapActive: boolean;
  hitBonus: number;
  breakBonus: number;
  guardStrong: boolean;
  combatScale?: ScaledMonster;
  isRematch?: boolean;
  pendingAction?: { kind: 'attack' | 'skill'; skillId?: string };
  enemyState?: EnemyStateJson;
}

type MonsterRow = {
  id: string; name: string; level: number; attack: number; magic: number; defense: number; spirit: number; speed: number;
  break_max: number; exp_reward: number; gold_reward: number; drop_pool_json: string; ai_pattern_json: string; hp: number;
  area_tag?: string; element?: string | null; weaknesses_json?: string | null; resistances_json?: string | null;
  is_boss?: number;
};

type SessionRow = {
  id: string; monster_id: string; area_id: string | null; player_hp: number; player_mp: number;
  enemy_hp: number; enemy_break: number; enemy_state_json?: string | null; status_json: string;
  is_boss: number; is_raid: number;
  is_event_battle: number; can_flee: number; status: BattleStatus;
  trial_type?: string | null; trial_job?: string | null;
};

const ACTION_PRIORITY: Record<string, number> = { defend: 20, item: 10, attack: 0, skill: 0 };

export function getActiveBattle(userId: string) {
  return getDb().prepare(`SELECT * FROM battle_sessions WHERE user_id = ? AND status = 'active' ORDER BY created_at DESC LIMIT 1`).get(userId);
}

function countCompletedBattles(userId: string): number {
  const row = getDb().prepare(`SELECT COUNT(*) AS c FROM battle_sessions WHERE user_id = ? AND status IN ('victory', 'defeat', 'fled')`).get(userId) as { c: number };
  return row.c;
}

export function createBattle(
  userId: string,
  monsterIdOrIds: string | string[],
  areaId: string | null,
  opts?: {
    isBoss?: boolean; isRaid?: boolean; isEvent?: boolean; isRematch?: boolean;
    isTrial?: boolean; trialType?: string; trialJob?: string;
  },
): string {
  const monsterIds = Array.isArray(monsterIdOrIds) ? monsterIdOrIds : [monsterIdOrIds];
  return createBattleInternal(userId, monsterIds, areaId, opts);
}

function createBattleInternal(
  userId: string,
  monsterIds: string[],
  areaId: string | null,
  opts?: {
    isBoss?: boolean; isRaid?: boolean; isEvent?: boolean; isRematch?: boolean;
    isTrial?: boolean; trialType?: string; trialJob?: string;
  },
): string {
  const player = requirePlayer(userId);
  recalculatePlayerStats(userId);
  const p = requirePlayer(userId);
  const monsterId = monsterIds[0]!;
  const monster = getDb().prepare('SELECT * FROM monsters WHERE id = ?').get(monsterId) as MonsterRow | undefined;
  if (!monster) throw new Error('Monster not found');
  if (getActiveBattle(userId)) throw new Error('既に戦闘中です。');

  const isBoss = opts?.isBoss ?? false;
  const isRaid = opts?.isRaid ?? false;
  const isEvent = opts?.isEvent ?? false;
  const isRematch = opts?.isRematch ?? false;
  const isTrial = opts?.isTrial ?? false;
  const trialType = opts?.trialType ?? null;
  const trialJob = opts?.trialJob ?? null;
  const canFlee = (!isBoss && !isRaid && !isEvent && !isTrial) ? 1 : 0;
  const tutorialBattle = monsterId === 'mon_star_slime' && countCompletedBattles(userId) === 0;
  const areaRank = areaId ? getAreaRank(areaId) : 1;
  const enemyState = buildEnemyStateFromMonsters(monsterIds, areaId, {
    isBoss,
    isStoryBoss: isBoss,
    areaRank,
  });
  const legacy = syncLegacyEnemyColumns(enemyState);
  const scaled = enemyState.enemies[0]!.combatScale;
  const id = uuid();
  const names = enemyState.enemies.map((e) => `${e.label}:${e.name}`).join(' / ');
  const threatLine = getThreatLabel(scaled.threatTier, monster.name);
  const state: BattleState = {
    ...mergeStatusState(loadBattleStatusFromPlayer(userId)),
    defending: false, enemyBroken: false, breakRemainingHits: 0, playerBreakDamageMult: 1.25,
    usedRevive: false,
    fleeBonus: 0, atkBuff: 0, magBuff: 0, defBuff: 0, trapActive: false,
    hitBonus: 0, breakBonus: 0, guardStrong: false,
    combatScale: scaled,
    enemyState,
    isRematch,
    log: tutorialBattle
      ? [formatBattleLine('info', names + 'が現れた。…最初の一歩。油断は禁物だ。')]
      : [
        formatBattleLine('info', enemyState.partySize > 1 ? `${names}が現れた！` : monster.name + 'が現れた！'),
        ...(threatLine && scaled.threatTier !== 'normal' ? [formatBattleLine('info', threatLine)] : []),
      ],
    tutorialBattle,
  };

  getDb().prepare(`
    INSERT INTO battle_sessions (id, user_id, area_id, monster_id, player_hp, player_mp, enemy_hp, enemy_break, enemy_state_json, status_json, is_boss, is_raid, is_event_battle, can_flee, trial_type, trial_job, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)
  `).run(id, userId, areaId, legacy.monster_id, p.hp, p.mp, legacy.enemy_hp, legacy.enemy_break,
    serializeEnemyState(enemyState), JSON.stringify(state),
    isBoss ? 1 : 0, isRaid ? 1 : 0, isEvent ? 1 : 0, canFlee, trialType, trialJob, nowIso(), nowIso());
  return id;
}

function parseState(json: string): BattleState {
  const s = JSON.parse(json) as Partial<BattleState>;
  return {
    ...mergeStatusState(s),
    defending: s.defending ?? false,
    enemyBroken: s.enemyBroken ?? false,
    breakRemainingHits: s.breakRemainingHits ?? 0,
    playerBreakDamageMult: s.playerBreakDamageMult ?? 1.25,
    usedRevive: s.usedRevive ?? false,
    log: s.log ?? [],
    tutorialBattle: s.tutorialBattle,
    fleeBonus: s.fleeBonus ?? 0,
    atkBuff: s.atkBuff ?? 0,
    magBuff: s.magBuff ?? 0,
    defBuff: s.defBuff ?? 0,
    trapActive: s.trapActive ?? false,
    hitBonus: s.hitBonus ?? 0,
    breakBonus: s.breakBonus ?? 0,
    guardStrong: s.guardStrong ?? false,
    combatScale: s.combatScale,
    enemyState: s.enemyState,
    pendingAction: s.pendingAction,
  };
}

function resolveEnemyState(session: SessionRow, state: BattleState): EnemyStateJson {
  if (state.enemyState) return state.enemyState;
  const loaded = loadEnemyState(session);
  state.enemyState = loaded;
  return loaded;
}

function syncStateEnemyToLegacy(state: BattleState): void {
  if (!state.enemyState) return;
  const legacy = syncLegacyEnemyColumns(state.enemyState);
  void legacy;
}

function needsTargetSelection(
  action: 'attack' | 'skill',
  skill: SkillRow | undefined,
  enemyState: EnemyStateJson,
): boolean {
  if (getAliveEnemies(enemyState).length <= 1) return false;
  if (action === 'attack') return true;
  if (!skill) return false;
  const target = skill.target_type ?? 'single_enemy';
  if (target === 'all_enemies') return false;
  if (['self', 'ally', 'all_allies', 'cover', 'taunt'].includes(target)) return false;
  return true;
}

function getPrimaryMonster(enemyState: EnemyStateJson, session: SessionRow): MonsterRow {
  const primary = getAliveEnemies(enemyState)[0] ?? enemyState.enemies[0];
  const id = primary?.monster_id ?? session.monster_id;
  return getDb().prepare('SELECT * FROM monsters WHERE id = ?').get(id) as MonsterRow;
}

function getCombatScale(state: BattleState, monster: MonsterRow): ScaledMonster {
  if (state.combatScale) return state.combatScale;
  return scaleMonsterForBattle(
    { ...monster, id: monster.id, area_tag: monster.area_tag ?? 'starfield' },
  );
}

function getEnemyHpDisplay(session: SessionRow, state: BattleState, monster: MonsterRow): { current: number; max: number } {
  const max = getCombatScale(state, monster).hp;
  return { current: Math.min(Math.max(0, session.enemy_hp), max), max };
}

function getPlayerBattleDisplay(session: SessionRow, player: ReturnType<typeof requirePlayer>): { hp: number; mp: number } {
  return {
    hp: Math.min(Math.max(0, session.player_hp), player.max_hp),
    mp: Math.min(Math.max(0, session.player_mp), player.max_mp),
  };
}

function getPlayerWeaponElement(userId: string): string | null {
  const row = getDb().prepare(`
    SELECT e.element FROM player_equipment pe
    JOIN player_inventory pi ON pe.inventory_id = pi.id
    JOIN equipment e ON pi.item_id = e.item_id
    WHERE pe.user_id = ? AND pe.slot = 'weapon'
  `).get(userId) as { element: string | null } | undefined;
  return row?.element ?? null;
}

function applyElementDamage(
  baseDamage: number,
  attackElement: string | null | undefined,
  monster: MonsterRow,
  logFn: (line: string) => void,
): number {
  const atkEl = resolveAttackElement({ weaponElement: attackElement, skillElement: attackElement, defaultElement: 'neutral' });
  const { multiplier, logText } = calcElementDamageMultiplier(atkEl, monster);
  if (logText && multiplier !== 1) logFn(logText);
  return applyElementToDamage(baseDamage, multiplier);
}

function pushLog(state: BattleState, type: BattleLogType, line: string): void {
  state.log.push(formatBattleLine(type, line));
  if (state.log.length > 12) state.log.shift();
}

function getAreaLevels(session: SessionRow, monster: MonsterRow) {
  let areaMin = monster.level - 2;
  let areaMax = monster.level + 5;
  if (session.area_id) {
    const area = getDb().prepare('SELECT recommended_min_level, recommended_max_level FROM exploration_areas WHERE id = ?').get(session.area_id) as {
      recommended_min_level: number; recommended_max_level: number;
    } | undefined;
    if (area) { areaMin = area.recommended_min_level; areaMax = area.recommended_max_level; }
  }
  return { areaMin, areaMax };
}

function getScalingStat(player: ReturnType<typeof requirePlayer>, stat: string): number {
  const map: Record<string, number> = {
    attack: player.attack, magic: player.magic, spirit: player.spirit,
    defense: player.defense, speed: player.speed,
  };
  if (stat === 'attack_magic') return Math.floor((player.attack + player.magic) / 2);
  return map[stat] ?? player.attack;
}

function calcFleeRate(player: ReturnType<typeof requirePlayer>, monster: MonsterRow, diff: ReturnType<typeof getDifficultyModifiers>, state: BattleState, canFlee: boolean): number {
  if (!canFlee) return 0;
  let rate = 0.65;
  const speedDiff = player.speed - Math.max(1, monster.speed - state.enemySlow);
  if (speedDiff > 0) rate += Math.min(0.2, speedDiff * 0.02);
  else rate -= Math.min(0.2, Math.abs(speedDiff) * 0.02);
  if (diff.levelDeficit > 0) rate -= diff.levelDeficit * 0.1;
  rate += state.fleeBonus;
  if (state.defending) rate += 0.05;
  return Math.max(0.2, Math.min(0.9, rate));
}

function calcDamage(atk: number, def: number, critRate: number, critDmg: number, multiplier: number, hitRate: number, bonusCrit = 0, bonusHit = 0): { hit: boolean; damage: number; crit: boolean } {
  if (!roll(hitRate + bonusHit)) return { hit: false, damage: 0, crit: false };
  const crit = roll(critRate + bonusCrit);
  let base = calcPhysicalDamage(atk, def, multiplier);
  if (crit) base = Math.floor(base * critDmg);
  return { hit: true, damage: base, crit };
}

function skillPriority(skill: SkillRow): number {
  if (skill.priority) return skill.priority;
  if (['recovery', 'support', 'guard'].includes(skill.skill_type)) return 10;
  if (skill.power >= 1.3) return -10;
  return 0;
}

function turnOrder(pSpeed: number, eSpeed: number, pPri: number, ePri: number, tutorial: boolean): Array<'player' | 'enemy'> {
  if (tutorial) return ['player', 'enemy'];
  const pScore = pSpeed + pPri + randomInt(-2, 2);
  const eScore = eSpeed + ePri + randomInt(-2, 2);
  return pScore >= eScore ? ['player', 'enemy'] : ['enemy', 'player'];
}

function getSession(sessionId: string, userId: string): SessionRow | undefined {
  return getDb().prepare('SELECT * FROM battle_sessions WHERE id = ? AND user_id = ?').get(sessionId, userId) as SessionRow | undefined;
}

export function processBattleAction(
  userId: string,
  sessionId: string,
  action: string,
  opts?: { skillId?: string; inventoryId?: number; targetInstanceId?: string },
): { done: boolean; status: BattleStatus; message: string; sessionId: string; notify?: string; needsTarget?: boolean; skillLearned?: Array<{ jobName: string; skills: string[] }>; jobLeveledUp?: string[] } {
  const session = getSession(sessionId, userId);
  if (!session || session.status !== 'active') {
    return { done: true, status: 'defeat', message: '戦闘が見つかりません。', sessionId };
  }

  let state = parseState(session.status_json);
  const enemyState = resolveEnemyState(session, state);
  const monster = getPrimaryMonster(enemyState, session);
  const player = requirePlayer(userId);
  let pHp = session.player_hp;
  let pMp = session.player_mp;
  let eHp = session.enemy_hp;
  let eBreak = session.enemy_break;
  const { areaMin, areaMax } = getAreaLevels(session, monster);
  const isValhalla = session.area_id?.includes('valhalla') || monster.area_tag === 'valhalla';
  const diff = getDifficultyModifiers(player.level, areaMin, areaMax, { isValhalla });
  const tutorial = !!state.tutorialBattle;
  const canFlee = session.can_flee === 1;

  if (action === 'flee') {
    if (!canFlee) {
      return { done: false, status: 'active', message: 'この戦いからは退けない。\n灯火が揺れても、道はまだ閉じたままだ。', sessionId, notify: 'blocked' };
    }
    const fleeChance = calcFleeRate(player, monster, diff, state, canFlee);
    if (roll(fleeChance)) {
      syncBattleResourcesToPlayer(userId, pHp, pMp);
      syncBattleStatusToPlayer(userId, state);
      endBattle(sessionId, 'fled');
      return { done: true, status: 'fled', message: '足音を消し、戦いから離れた。', sessionId };
    }
    pushLog(state, 'flee_fail', '逃げ道を塞がれた。\n　敵が追撃してくる。');
    const es = resolveEnemyState(session, state);
    const er = executeEnemiesTurn(es, player, state, diff, tutorial, pHp, session.is_boss === 1);
    pHp = er.pHp; state = er.state;
    if (pHp <= 0) return resolveDefeat(sessionId, userId, session, state, pHp, pMp);
    const legacy = syncLegacyEnemyColumns(es);
    persistBattle(sessionId, userId, pHp, pMp, legacy.enemy_hp, legacy.enemy_break, state, es);
    return { done: false, status: 'active', message: state.log[state.log.length - 1] ?? '', sessionId };
  }

  if (action === 'target' && opts?.targetInstanceId && state.pendingAction) {
    const target = getEnemyByInstanceId(enemyState, opts.targetInstanceId);
    if (!target || !target.is_alive || target.hp <= 0) {
      state.pendingAction = undefined;
      return { done: false, status: 'active', message: 'その敵はもう倒れている。', sessionId, notify: 'blocked' };
    }
    const pending = state.pendingAction;
    state.pendingAction = undefined;
    if (pending.kind === 'attack') {
      return resolvePlayerTurn(userId, sessionId, session, monster, player, state, diff, tutorial, 'attack', pHp, pMp, eHp, eBreak, undefined, undefined, opts.targetInstanceId);
    }
    if (pending.kind === 'skill' && pending.skillId) {
      const skill = getDb().prepare('SELECT * FROM skills WHERE id = ?').get(pending.skillId) as SkillRow | undefined;
      if (!skill) return { done: false, status: 'active', message: 'その技は使えない。', sessionId };
      return resolvePlayerTurn(userId, sessionId, session, monster, player, state, diff, tutorial, 'skill', pHp, pMp, eHp, eBreak, skill, undefined, opts.targetInstanceId);
    }
  }

  if (action === 'attack' && needsTargetSelection('attack', undefined, enemyState)) {
    state.pendingAction = { kind: 'attack' };
    persistBattle(sessionId, userId, pHp, pMp, eHp, eBreak, state, enemyState);
    return { done: false, status: 'active', message: '攻撃する敵を選んでください。', sessionId, needsTarget: true };
  }

  if (action === 'skill' && opts?.skillId) {
    if (!isUsableBattleSkill(userId, opts.skillId)) {
      return { done: false, status: 'active', message: 'その技は、今は使えない。', sessionId, notify: 'blocked' };
    }
    const skill = getDb().prepare('SELECT * FROM skills WHERE id = ?').get(opts.skillId) as SkillRow | undefined;
    if (!skill) return { done: false, status: 'active', message: 'その技は使えない。', sessionId };
    if (state.playerSilence > 0 && skill.skill_type !== 'physical') {
      state.playerSilence--;
      return { done: false, status: 'active', message: '沈黙のせいで技が使えない。', sessionId, notify: 'blocked' };
    }
    if (pMp < skill.mp_cost) {
      return { done: false, status: 'active', message: '魔力を巡らせる余力が足りない。', sessionId, notify: 'mp' };
    }
    if (needsTargetSelection('skill', skill, enemyState)) {
      state.pendingAction = { kind: 'skill', skillId: skill.id };
      persistBattle(sessionId, userId, pHp, pMp, eHp, eBreak, state, enemyState);
      return { done: false, status: 'active', message: `${skill.name}の対象を選んでください。`, sessionId, needsTarget: true };
    }
    return resolvePlayerTurn(userId, sessionId, session, monster, player, state, diff, tutorial, action, pHp, pMp, eHp, eBreak, skill, opts.inventoryId);
  }

  if (action === 'item' && opts?.inventoryId) {
    const used = useBattleItem(userId, opts.inventoryId, state, pHp, pMp, player);
    if (!used.ok) return { done: false, status: 'active', message: used.message, sessionId };
    pHp = used.pHp;
    pMp = used.pMp;
    state = used.state;
    return resolvePlayerTurn(userId, sessionId, session, monster, player, state, diff, tutorial, 'item', pHp, pMp, eHp, eBreak, undefined, opts.inventoryId);
  }

  return resolvePlayerTurn(userId, sessionId, session, monster, player, state, diff, tutorial, action, pHp, pMp, eHp, eBreak, undefined, opts?.inventoryId);
}

function resolvePlayerTurn(
  userId: string, sessionId: string, session: SessionRow, monster: MonsterRow,
  player: ReturnType<typeof requirePlayer>, state: BattleState, diff: ReturnType<typeof getDifficultyModifiers>,
  tutorial: boolean, action: string, pHp: number, pMp: number, eHp: number, eBreak: number,
  skill?: SkillRow, _invId?: number, targetInstanceId?: string,
) {
  const enemyState = resolveEnemyState(session, state);
  const pPriority = action === 'defend' ? 20 : action === 'item' ? 10 : skill ? skillPriority(skill) : 0;
  const pSpeed = Math.floor(player.speed * diff.playerSpeed);
  const eSpeed = Math.floor(Math.max(1, monster.speed - state.enemySlow) * diff.enemySpeed);
  const order = turnOrder(pSpeed, eSpeed, pPriority, 0, tutorial);

  for (const actor of order) {
    if (actor === 'player') {
      if (isPlayerActionBlocked(state)) {
        pushLog(state, 'status', '足が止まり、行動できなかった。');
        state.playerBind = Math.max(0, state.playerBind - 1);
      } else {
        const r = executePlayerAction(action, skill, userId, player, monster, state, diff, pHp, pMp, eHp, eBreak, session.is_boss === 1, targetInstanceId, enemyState);
        pHp = r.pHp; pMp = r.pMp; eHp = r.eHp; eBreak = r.eBreak; state = r.state;
      }
      const legacy = syncLegacyEnemyColumns(enemyState);
      eHp = legacy.enemy_hp;
      eBreak = legacy.enemy_break;
      if (allEnemiesDefeated(enemyState)) {
        pushLog(state, 'info', enemyState.partySize > 1 ? '敵をすべて打ち倒した。' : `${monster.name}を打ち倒した。`);
        return resolveVictory(sessionId, userId, session, monster, state, enemyState, pHp, pMp);
      }
      if (pHp <= 0) return resolveDefeat(sessionId, userId, session, state, pHp, pMp);
    } else {
      const r = executeEnemiesTurn(enemyState, player, state, diff, tutorial, pHp, session.is_boss === 1);
      pHp = r.pHp; state = r.state;
      const legacyE = syncLegacyEnemyColumns(enemyState);
      eHp = legacyE.enemy_hp;
      eBreak = legacyE.enemy_break;
      if (pHp <= 0) return resolveDefeat(sessionId, userId, session, state, pHp, pMp);
      if (allEnemiesDefeated(enemyState)) {
        pushLog(state, 'info', enemyState.partySize > 1 ? '敵をすべて打ち倒した。' : `${monster.name}を打ち倒した。`);
        return resolveVictory(sessionId, userId, session, monster, state, enemyState, pHp, pMp);
      }
    }
  }

  const tick = tickStatusEffects(state, pHp, player.max_hp, eHp, monster.name, session.is_boss === 1);
  pHp = tick.pHp; eHp = tick.eHp;
  for (const line of tick.logs) pushLog(state, 'status', line);
  const legacyTick = syncLegacyEnemyColumns(enemyState);
  eHp = legacyTick.enemy_hp;
  if (allEnemiesDefeated(enemyState)) {
    pushLog(state, 'info', enemyState.partySize > 1 ? '敵をすべて打ち倒した。' : `${monster.name}を打ち倒した。`);
    return resolveVictory(sessionId, userId, session, monster, state, enemyState, pHp, pMp);
  }
  if (pHp <= 0) return resolveDefeat(sessionId, userId, session, state, pHp, pMp);

  state.defending = false;
  state.guardStrong = false;
  persistBattle(sessionId, userId, pHp, pMp, eHp, eBreak, state, enemyState);
  return { done: false, status: 'active' as BattleStatus, message: state.log[state.log.length - 1] ?? '', sessionId };
}

function executePlayerAction(
  action: string, skill: SkillRow | undefined, userId: string,
  player: ReturnType<typeof requirePlayer>, monster: MonsterRow, state: BattleState,
  diff: ReturnType<typeof getDifficultyModifiers>,
  pHp: number, pMp: number, eHp: number, eBreak: number,
  isBoss: boolean,
  targetInstanceId?: string,
  enemyState?: EnemyStateJson,
) {
  const es = enemyState ?? state.enemyState;
  if (!es) {
    return executePlayerActionLegacy(action, skill, userId, player, monster, state, diff, pHp, pMp, eHp, eBreak, isBoss);
  }

  if (action === 'defend') {
    state.defending = true;
    pushLog(state, 'player_attack', '構えを取り、身を固めた。');
    return { pHp, pMp, eHp, eBreak, state };
  }

  if (action === 'attack') {
    const target = targetInstanceId
      ? getEnemyByInstanceId(es, targetInstanceId)
      : getAliveEnemies(es)[0];
    if (!target) return { pHp, pMp, eHp, eBreak, state };
    const r = applyPhysicalAttack(userId, player, target, monster, state, diff, isBoss, es.partySize);
    target.hp = r.targetHp;
    target.break = r.targetBreak;
    if (target.hp <= 0) target.is_alive = false;
    const legacy = syncLegacyEnemyColumns(es);
    return { pHp, pMp, eHp: legacy.enemy_hp, eBreak: legacy.enemy_break, state };
  }

  if (action === 'skill' && skill) {
    pMp -= skill.mp_cost;
    return applySkill(skill, player, monster, state, diff, pHp, pMp, eHp, eBreak, isBoss, es, targetInstanceId);
  }

  if (action === 'item') {
    return { pHp, pMp, eHp, eBreak, state };
  }

  return { pHp, pMp, eHp, eBreak, state };
}

function executePlayerActionLegacy(
  action: string, skill: SkillRow | undefined, userId: string,
  player: ReturnType<typeof requirePlayer>, monster: MonsterRow, state: BattleState,
  diff: ReturnType<typeof getDifficultyModifiers>,
  pHp: number, pMp: number, eHp: number, eBreak: number,
  isBoss: boolean,
) {
  const statusMods = getDefensiveModifiers(state, isBoss);
  const scale = getCombatScale(state, monster);

  if (action === 'defend') {
    state.defending = true;
    pushLog(state, 'player_attack', '構えを取り、身を固めた。');
    return { pHp, pMp, eHp, eBreak, state };
  }

  if (action === 'attack') {
    const mult = diff.playerDamage * (1 + state.atkBuff);
    const def = Math.floor(scale.defense * statusMods.enemyDefMult);
    const result = calcDamage(player.attack, def, player.crit_rate, player.crit_damage, mult, diff.playerHitRate + state.hitBonus + statusMods.hitPenalty, 0, state.hitBonus);
    if (result.hit) {
      const wpnEl = getPlayerWeaponElement(userId);
      let dmg = applyElementDamage(result.damage, wpnEl, monster, (line) => pushLog(state, 'player_attack', line));
      dmg = applyPlayerBreakDamage(state, dmg);
      eHp -= dmg;
      eBreak += dmg * 0.3 * diff.breakRate + state.breakBonus;
      pushLog(state, 'player_attack', `あなたの攻撃。\n　${monster.name}に **${dmg}** ダメージ${result.crit ? '（会心）' : ''}。`);
      eBreak = checkBreak(state, monster, eBreak);
    } else pushLog(state, 'player_attack', 'あなたの攻撃。\n　外れた。');
    return { pHp, pMp, eHp, eBreak, state };
  }

  if (action === 'skill' && skill) {
    pMp -= skill.mp_cost;
    return applySkill(skill, player, monster, state, diff, pHp, pMp, eHp, eBreak, isBoss);
  }

  if (action === 'item') {
    return { pHp, pMp, eHp, eBreak, state };
  }

  return { pHp, pMp, eHp, eBreak, state };
}

function resolveSkillStatusTarget(
  skill: SkillRow,
  fx: ReturnType<typeof resolveSkillEffect>,
  effect: string,
): { effect: StatusEffectKey; duration: number; skillRate?: number } | null {
  if (fx.statusEffect) {
    return {
      effect: fx.statusEffect,
      duration: fx.statusDuration ?? (fx.statusEffect === 'bind' ? 1 : 2),
      skillRate: fx.statusChance,
    };
  }
  if (skill.status_effect === 'poison') {
    return { effect: 'poison', duration: 3, skillRate: fx.statusChance };
  }
  if (effect === 'bind' || fx.implementationKey === 'bind') {
    return { effect: 'bind', duration: fx.statusDuration ?? 1, skillRate: fx.statusChance };
  }
  if (effect === 'slow' || fx.implementationKey === 'slow') {
    return { effect: 'slow', duration: fx.statusDuration ?? 2, skillRate: fx.statusChance };
  }
  return null;
}

function applySkill(
  skill: SkillRow,
  player: ReturnType<typeof requirePlayer>,
  monster: MonsterRow,
  state: BattleState,
  diff: ReturnType<typeof getDifficultyModifiers>,
  pHp: number,
  pMp: number,
  eHp: number,
  eBreak: number,
  isBoss: boolean,
  enemyState?: EnemyStateJson,
  targetInstanceId?: string,
) {
  const effect = skill.effect_type ?? '';
  const fx = resolveSkillEffect(skill.id, skill.effect_type, skill.status_effect);
  const statusMods = getDefensiveModifiers(state, isBoss);
  const scale = getCombatScale(state, monster);

  if (skill.skill_type === 'recovery' || effect === 'heal') {
    const heal = Math.floor(getScalingStat(player, skill.scaling_stat) * skill.power + player.level * 2);
    pHp = Math.min(player.max_hp, pHp + heal);
    pushLog(state, 'player_heal', `${skill.name}。\n　HPを **${heal}** 回復。`);
    return { pHp, pMp, eHp, eBreak, state };
  }

  if (effect === 'guard' || effect === 'guard_strong') {
    state.defending = true;
    state.guardStrong = effect === 'guard_strong';
    pushLog(state, 'player_attack', `${skill.name}。\n　身を固めた。`);
    return { pHp, pMp, eHp, eBreak, state };
  }

  if (effect === 'cure_poison') {
    state.poisonTurns = 0;
    pushLog(state, 'player_heal', `${skill.name}。\n　毒が祓われた。`);
    return { pHp, pMp, eHp, eBreak, state };
  }

  if (effect === 'flee_buff') {
    state.fleeBonus += 0.15;
    pushLog(state, 'player_attack', `${skill.name}。\n　影に紛れやすくなった。`);
    return { pHp, pMp, eHp, eBreak, state };
  }

  if (effect === 'mag_buff') { state.magBuff += 0.2; pushLog(state, 'player_skill', `${skill.name}。\n　魔力が高まった。`); return { pHp, pMp, eHp, eBreak, state }; }
  if (effect === 'atk_buff') { state.atkBuff += 0.2; pushLog(state, 'player_skill', `${skill.name}。\n　拳に力が込もった。`); return { pHp, pMp, eHp, eBreak, state }; }
  if (effect === 'def_buff') { state.defBuff += 0.15; pushLog(state, 'player_heal', `${skill.name}。\n　守りが強まった。`); return { pHp, pMp, eHp, eBreak, state }; }
  if (effect === 'scan') { state.hitBonus += 0.1; state.breakBonus += 10; pushLog(state, 'player_skill', `${skill.name}。\n　弱点が見えた。`); return { pHp, pMp, eHp, eBreak, state }; }
  if (effect === 'trap') { state.trapActive = true; pushLog(state, 'player_skill', `${skill.name}。\n　罠を仕掛けた。`); return { pHp, pMp, eHp, eBreak, state }; }
  if (effect === 'taunt') { state.hitBonus += 0.05; pushLog(state, 'player_attack', `${skill.name}。\n　敵の視線を引いた。`); return { pHp, pMp, eHp, eBreak, state }; }

  const statusTarget = resolveSkillStatusTarget(skill, fx, effect);
  if (skill.power <= 0 && statusTarget) {
    const statusResult = attemptApplyEnemyStatus({
      state,
      effect: statusTarget.effect,
      duration: statusTarget.duration,
      isBoss,
      threatTier: scale.threatTier,
      skillSuccessRate: statusTarget.skillRate,
      monsterName: monster.name,
    });
    pushLog(state, 'player_skill', `${skill.name}。`);
    for (const line of statusResult.logs) pushLog(state, 'status', line);
    eBreak += statusResult.breakBonus;
    eBreak = checkBreak(state, monster, eBreak);
    return { pHp, pMp, eHp, eBreak, state };
  }

  const hits = skill.hits ?? 1;
  const isMag = ['magic', 'divine', 'machine'].includes(skill.skill_type);
  const targetType = skill.target_type ?? 'single_enemy';
  const aoe = targetType === 'all_enemies';
  const alive = enemyState ? getAliveEnemies(enemyState) : [];
  const targets: EnemyInstance[] = aoe
    ? alive
    : [targetInstanceId && enemyState
      ? getEnemyByInstanceId(enemyState, targetInstanceId) ?? alive[0]
      : alive[0]].filter(Boolean) as EnemyInstance[];

  if (!targets.length && !aoe) {
    return { pHp, pMp, eHp, eBreak, state };
  }

  let stat = getScalingStat(player, skill.scaling_stat);
  if (skill.secondary_scaling_stat) stat = Math.floor((stat + getScalingStat(player, skill.secondary_scaling_stat)) / 2);
  const buffMult = 1 + (isMag ? state.magBuff : state.atkBuff);
  const aoeMult = aoe ? AOE_DAMAGE_MULT : 1;

  for (const target of targets.length ? targets : [{ monster_id: monster.id, combatScale: scale, hp: eHp, break: eBreak, name: monster.name, instance_id: 'enemy_1', label: 'A', max_hp: scale.hp, break_max: monster.break_max, is_alive: true, position: 0, status: {}, threatTier: scale.threatTier } as EnemyInstance]) {
    const monRow = getDb().prepare('SELECT * FROM monsters WHERE id = ?').get(target.monster_id) as MonsterRow;
    const tScale = target.combatScale ?? scale;
    const def = Math.floor((isMag ? tScale.spirit * statusMods.enemyMagMult : tScale.defense) * statusMods.enemyDefMult);
    const mult = diff.playerDamage * skill.power * buffMult * aoeMult;

    for (let i = 0; i < hits; i++) {
      const result = calcDamage(stat, def, player.crit_rate, player.crit_damage, mult / hits, diff.playerHitRate + (skill.hit_bonus ?? 0) + statusMods.hitPenalty, skill.crit_bonus ?? 0, state.hitBonus);
      if (result.hit) {
        let dmg = applyElementDamage(result.damage, skill.element, monRow ?? monster, (line) => pushLog(state, 'player_skill', line));
        dmg = applyPlayerBreakDamage(state, dmg);
        if (enemyState) {
          target.hp -= dmg;
          target.break += (skill.break_power ?? 0) * diff.breakRate + state.breakBonus;
          target.break = checkBreakOnEnemy(state, monRow ?? monster, target.break, target, enemyState.partySize);
          if (target.hp <= 0) target.is_alive = false;
        } else {
          eHp -= dmg;
          eBreak += (skill.break_power ?? 0) * diff.breakRate + state.breakBonus;
        }
        const logType: BattleLogType = skill.skill_type === 'divine' ? 'player_divine' : skill.skill_type === 'magic' ? 'player_skill' : 'player_attack';
        const name = enemyState ? formatEnemyDisplayName(target, enemyState.partySize) : monster.name;
        pushLog(state, logType, `${skill.name}${hits > 1 ? `（${i + 1}）` : ''}。\n　${name}に **${dmg}** ダメージ。`);
      } else pushLog(state, 'player_skill', `${skill.name}。\n　外れた。`);
    }

    if (statusTarget) {
      const statusResult = attemptApplyEnemyStatus({
        state,
        effect: statusTarget.effect,
        duration: statusTarget.duration,
        isBoss,
        threatTier: tScale.threatTier,
        skillSuccessRate: statusTarget.skillRate,
        monsterName: monRow?.name ?? monster.name,
      });
      for (const line of statusResult.logs) pushLog(state, 'status', line);
      if (enemyState) target.break += statusResult.breakBonus;
      else eBreak += statusResult.breakBonus;
    }
  }

  if (enemyState) {
    const legacy = syncLegacyEnemyColumns(enemyState);
    eHp = legacy.enemy_hp;
    eBreak = legacy.enemy_break;
  } else {
    eBreak = checkBreak(state, monster, eBreak);
  }

  return { pHp, pMp, eHp, eBreak, state };
}

function applyPlayerBreakDamage(state: BattleState, dmg: number, consumeHit = true): number {
  if (state.breakRemainingHits <= 0) return dmg;
  const boosted = Math.floor(dmg * (state.playerBreakDamageMult || 1.25));
  if (consumeHit) state.breakRemainingHits--;
  return boosted;
}

function applyPhysicalAttack(
  userId: string,
  player: ReturnType<typeof requirePlayer>,
  target: EnemyInstance,
  monster: MonsterRow,
  state: BattleState,
  diff: ReturnType<typeof getDifficultyModifiers>,
  isBoss: boolean,
  partySize = 1,
): { targetHp: number; targetBreak: number } {
  const statusMods = getDefensiveModifiers(state, isBoss);
  const scale = target.combatScale;
  const mult = diff.playerDamage * (1 + state.atkBuff);
  const def = Math.floor(scale.defense * statusMods.enemyDefMult);
  const result = calcDamage(player.attack, def, player.crit_rate, player.crit_damage, mult, diff.playerHitRate + state.hitBonus + statusMods.hitPenalty, 0, state.hitBonus);
  let hp = target.hp;
  let br = target.break;
  const monRow = getDb().prepare('SELECT * FROM monsters WHERE id = ?').get(target.monster_id) as MonsterRow;
  if (result.hit) {
    const wpnEl = getPlayerWeaponElement(userId);
    let dmg = applyElementDamage(result.damage, wpnEl, monRow ?? monster, (line) => pushLog(state, 'player_attack', line));
    dmg = applyPlayerBreakDamage(state, dmg);
    hp -= dmg;
    br += dmg * 0.3 * diff.breakRate + state.breakBonus;
    pushLog(state, 'player_attack', `あなたの攻撃。\n　${formatEnemyDisplayName(target, partySize)}に **${dmg}** ダメージ${result.crit ? '（会心）' : ''}。`);
    br = checkBreakOnEnemy(state, monRow ?? monster, br, target, partySize);
  } else pushLog(state, 'player_attack', 'あなたの攻撃。\n　外れた。');
  return { targetHp: hp, targetBreak: br };
}

function checkBreakOnEnemy(state: BattleState, monster: MonsterRow, eBreak: number, enemy?: EnemyInstance, partySize = 1): number {
  if (eBreak >= monster.break_max) {
    state.enemyBroken = true;
    state.breakRemainingHits = randomInt(1, 2);
    state.enemyNextAtkReducePct = 0.2;
    state.enemyNextAtkReduceActive = true;
    const name = enemy ? formatEnemyDisplayName(enemy, partySize) : monster.name;
    pushLog(state, 'break', `🟡 ブレイク！${name}の体勢が崩れた！`);
    return 0;
  }
  return eBreak;
}

function checkBreak(state: BattleState, monster: MonsterRow, eBreak: number): number {
  return checkBreakOnEnemy(state, monster, eBreak);
}

function executeEnemiesTurn(
  enemyState: EnemyStateJson,
  player: ReturnType<typeof requirePlayer>,
  state: BattleState,
  diff: ReturnType<typeof getDifficultyModifiers>,
  tutorial: boolean,
  pHp: number,
  isBoss: boolean,
): { pHp: number; state: BattleState } {
  if (state.trapActive) {
    const primary = getAliveEnemies(enemyState)[0];
    if (primary) {
      primary.break += 15 + state.breakBonus;
      const mon = getDb().prepare('SELECT * FROM monsters WHERE id = ?').get(primary.monster_id) as MonsterRow;
      primary.break = checkBreakOnEnemy(state, mon, primary.break, primary, enemyState.partySize);
    }
    state.trapActive = false;
    pushLog(state, 'break', '罠が炸裂した。\n　体勢を崩しやすくなった。');
  }

  const alive = getAliveEnemies(enemyState);
  const heavyFlags = pickEnemyHeavyFlags(alive);
  let hp = pHp;
  for (let i = 0; i < alive.length; i++) {
    const enemy = alive[i]!;
    const monster = getDb().prepare('SELECT * FROM monsters WHERE id = ?').get(enemy.monster_id) as MonsterRow;
    const r = executeSingleEnemyTurn(monster, enemy, player, state, diff, tutorial, hp, isBoss, heavyFlags[i] ?? false, enemyState.partySize);
    hp = r.pHp;
    state = r.state;
    if (hp <= 0) break;
  }
  return { pHp: hp, state };
}

function executeSingleEnemyTurn(
  monster: MonsterRow,
  enemy: EnemyInstance,
  player: ReturnType<typeof requirePlayer>,
  state: BattleState,
  diff: ReturnType<typeof getDifficultyModifiers>,
  tutorial: boolean,
  pHp: number,
  isBoss: boolean,
  forceHeavy: boolean,
  partySize = 1,
): { pHp: number; state: BattleState } {
  if (isEnemyActionBlocked(state, isBoss)) {
    pushLog(state, 'status', `${formatEnemyDisplayName(enemy, partySize)}は動けない！`);
    state.enemyBind = Math.max(0, state.enemyBind - 1);
    onEnemyControlBlocked(state);
    return { pHp, state };
  }

  const statusMods = getDefensiveModifiers(state, isBoss);
  const scale = enemy.combatScale;
  const ai = JSON.parse(monster.ai_pattern_json || '{}') as { poison_chance?: number; heavy_chance?: number };
  const atk = Math.floor(scale.attack * statusMods.enemyAtkMult);
  const heavy = forceHeavy || !!(ai.heavy_chance && roll(ai.heavy_chance)) || scale.threatTier === 'elite';
  if (!roll(diff.enemyHitRate)) {
    pushLog(state, 'enemy_attack', `${formatEnemyDisplayName(enemy, partySize)}の攻撃。\n　外れた。`);
    return { pHp, state };
  }

  let dmg = calcEnemyDamageToPlayer({
    attack: atk,
    playerDefense: player.defense + state.defBuff * 10,
    playerMaxHp: player.max_hp,
    threatTier: scale.threatTier,
    takenMult: diff.playerTaken * statusMods.playerTakenMult,
    heavy,
  });
  if (tutorial) dmg = Math.max(1, Math.floor(dmg * 0.55));
  if (state.defending) dmg = Math.floor(dmg * (state.guardStrong ? 0.40 : 0.55));
  const atkReduce = getEnemyAttackReduceMult(state);
  if (atkReduce < 1) {
    dmg = Math.floor(dmg * atkReduce);
    consumeEnemyAttackReduce(state);
  }
  const resists = getPlayerElementResistances(player.user_id);
  const mit = applyPlayerElementResist(dmg, monster.element, resists);
  dmg = mit.damage;
  pHp -= dmg;
  pushLog(state, 'enemy_attack', `${formatEnemyDisplayName(enemy, partySize)}の攻撃${heavy ? '（強）' : ''}。\n　あなたに **${dmg}** ダメージ。`);
  if (mit.logText) pushLog(state, 'status', mit.logText);
  if (ai.poison_chance && roll(ai.poison_chance + diff.statusAccBonus)) {
    applyStatusEffect(state, 'player', 'poison', 3, false);
    pushLog(state, 'status', '毒を受けた。');
  }

  return { pHp, state };
}

function executeEnemyTurn(monster: MonsterRow, player: ReturnType<typeof requirePlayer>, state: BattleState, diff: ReturnType<typeof getDifficultyModifiers>, tutorial: boolean, pHp: number, eHp: number, eBreak: number, isBoss: boolean) {
  if (state.trapActive) {
    eBreak += 15 + state.breakBonus;
    state.trapActive = false;
    pushLog(state, 'break', '罠が炸裂した。\n　体勢を崩しやすくなった。');
    eBreak = checkBreak(state, monster, eBreak);
  }

  if (isEnemyActionBlocked(state, isBoss)) {
    pushLog(state, 'status', `${monster.name}は動けない！`);
    state.enemyBind = Math.max(0, state.enemyBind - 1);
    onEnemyControlBlocked(state);
    return { pHp, eHp, eBreak, state };
  }

  const statusMods = getDefensiveModifiers(state, isBoss);
  const scale = getCombatScale(state, monster);
  const ai = JSON.parse(monster.ai_pattern_json || '{}') as { poison_chance?: number; heavy_chance?: number };
  const atk = Math.floor(scale.attack * statusMods.enemyAtkMult);
  const heavy = !!(ai.heavy_chance && roll(ai.heavy_chance)) || scale.threatTier === 'elite';
  if (!roll(diff.enemyHitRate)) {
    pushLog(state, 'enemy_attack', `${monster.name}の攻撃。\n　外れた。`);
    return { pHp, eHp, eBreak, state };
  }

  let dmg = calcEnemyDamageToPlayer({
    attack: atk,
    playerDefense: player.defense + state.defBuff * 10,
    playerMaxHp: player.max_hp,
    threatTier: scale.threatTier,
    takenMult: diff.playerTaken * statusMods.playerTakenMult,
    heavy,
  });
  if (tutorial) dmg = Math.max(1, Math.floor(dmg * 0.55));
  if (state.defending) dmg = Math.floor(dmg * (state.guardStrong ? 0.40 : 0.55));
  const atkReduce = getEnemyAttackReduceMult(state);
  if (atkReduce < 1) {
    dmg = Math.floor(dmg * atkReduce);
    consumeEnemyAttackReduce(state);
  }
  const resists = getPlayerElementResistances(player.user_id);
  const mit = applyPlayerElementResist(dmg, monster.element, resists);
  dmg = mit.damage;
  pHp -= dmg;
  pushLog(state, 'enemy_attack', `${monster.name}の攻撃${heavy ? '（強）' : ''}。\n　あなたに **${dmg}** ダメージ。`);
  if (mit.logText) pushLog(state, 'status', mit.logText);
  if (ai.poison_chance && roll(ai.poison_chance + diff.statusAccBonus)) {
    applyStatusEffect(state, 'player', 'poison', 3, false);
    pushLog(state, 'status', '毒を受けた。');
  }

  return { pHp, eHp, eBreak, state };
}

function useBattleItem(userId: string, inventoryId: number, state: BattleState, pHp: number, pMp: number, player: ReturnType<typeof requirePlayer>) {
  const row = getDb().prepare(`
    SELECT pi.id AS inventory_id, pi.quantity, i.id AS item_id, i.name, i.battle_effect_json
    FROM player_inventory pi JOIN items i ON pi.item_id = i.id
    WHERE pi.id = ? AND pi.user_id = ? AND i.battle_usable = 1 AND pi.quantity > 0
  `).get(inventoryId, userId) as { inventory_id: number; quantity: number; item_id: string; name: string; battle_effect_json: string | null } | undefined;

  if (!row?.battle_effect_json) return { ok: false, message: 'その品は使えない。', pHp, pMp, state };
  const effect = JSON.parse(row.battle_effect_json) as { type: string; value?: number };

  if (effect.type === 'revive') {
    if (state.usedRevive) return { ok: false, message: 'この戦いでは既に使った。', pHp, pMp, state };
    pHp = Math.floor(player.max_hp * (effect.value ?? 0.3));
    state.usedRevive = true;
    pushLog(state, 'player_heal', `${row.name}。\n　立ち上がった。`);
  } else if (effect.type === 'heal_hp') {
    const heal = effect.value ?? 50;
    pHp = Math.min(player.max_hp, pHp + heal);
    pushLog(state, 'player_heal', `${row.name}。\n　HPを **${heal}** 回復。`);
  } else if (effect.type === 'cure_poison') {
    state.poisonTurns = 0;
    pushLog(state, 'player_heal', `${row.name}。\n　毒が治った。`);
  } else if (effect.type === 'flee_boost') {
    state.fleeBonus += effect.value ?? 0.25;
    pushLog(state, 'flee_ok', `${row.name}。\n　煙が広がった。`);
  } else if (effect.type === 'break_boost') {
    state.breakBonus += effect.value ?? 15;
    pushLog(state, 'break', `${row.name}。\n　敵の隙が見えた。`);
  } else {
    return { ok: false, message: '効果が分からない。', pHp, pMp, state };
  }

  if (row.quantity <= 1) getDb().prepare('DELETE FROM player_inventory WHERE id = ?').run(row.inventory_id);
  else getDb().prepare('UPDATE player_inventory SET quantity = quantity - 1, updated_at = ? WHERE id = ?').run(nowIso(), row.inventory_id);

  return { ok: true, message: '', pHp, pMp, state };
}

function hasBossFirstKill(userId: string, monsterId: string): boolean {
  const row = getDb().prepare(`
    SELECT COUNT(*) AS c FROM battle_sessions WHERE user_id = ? AND monster_id = ? AND status = 'victory'
  `).get(userId, monsterId) as { c: number };
  return row.c === 0;
}

function resolveVictory(
  sessionId: string,
  userId: string,
  session: SessionRow,
  monster: MonsterRow,
  state: BattleState,
  enemyState: EnemyStateJson | undefined,
  pHp: number,
  pMp: number,
) {
  const es = enemyState ?? state.enemyState ?? loadEnemyState(session);
  const rewardMult = es.rewardMult ?? 1;
  const wasFirstKill = session.is_boss ? hasBossFirstKill(userId, session.monster_id) : false;
  syncBattleResourcesToPlayer(userId, pHp, pMp);
  syncBattleStatusToPlayer(userId, state);
  endBattle(sessionId, 'victory');

  if (isTrialBattleSession(session)) {
    const baseJob = parseTrialBaseJob(session);
    const trialMsg = baseJob ? handleTrialVictory(userId, baseJob) : '試練に勝利した。';
    pushLog(state, 'info', '勝利。');
    return {
      done: true,
      status: 'victory' as BattleStatus,
      message: `🔵 現身の試練に勝利した。\n\n${trialMsg}`,
      sessionId,
      isRematch: false,
    };
  }

  const player = requirePlayer(userId);
  const scale = getCombatScale(state, monster);
  const rewardMults = getBattleRewardMultipliers({
    threatTier: scale.threatTier,
    areaTag: monster.area_tag ?? 'starfield',
    isBoss: session.is_boss === 1,
    isRematch: !!state.isRematch,
    isRaid: session.is_raid === 1,
    partyRewardMult: es.rewardMult ?? 1,
  });
  let exp = calcBattleExp(Math.floor(monster.exp_reward * rewardMults.expMult), player.level, monster.level);
  if (session.is_boss) {
    const first = state.isRematch ? false : wasFirstKill;
    exp = calcBossExp(calcBattleExp(Math.floor(monster.exp_reward * rewardMults.expMult), player.level, monster.level), first);
  }
  const gold = Math.floor(monster.gold_reward * rewardMults.goldMult);
  const levelResult = addExp(userId, exp);
  const jobResults = grantBattleJobExp(userId, exp);
  for (const jr of jobResults) {
    afterJobExpGranted(userId, jr.jobName);
  }
  addGold(userId, gold);
  // Pending rewards are confirmed on town return; battle victory keeps them pending until then
  const dropMsgs: string[] = [];
  const areaRow = session.area_id
    ? getDb().prepare('SELECT recommended_min_level, town_id FROM exploration_areas WHERE id = ?').get(session.area_id) as {
      recommended_min_level: number; town_id: string;
    } | undefined
    : undefined;
  const rewardPool = areaRow
    ? buildEffectiveRewardPool(areaRow.town_id, session.area_id!)
    : (JSON.parse(monster.drop_pool_json || '[]') as Array<{ item_id: string; weight: number }>);
  const lootTier = areaRow ? getAreaLootTier(areaRow.recommended_min_level, areaRow.town_id) : 'mid';
  const threat = (scale.threatTier ?? 'normal') as BattleThreatTier;

  if (state.isRematch) {
    const rematchKind = rollRematchGenericLoot();
    if (rematchKind === 'normal_mat') {
      const matId = pickMaterialFromPool(rewardPool.length ? rewardPool : [{ item_id: 'mat_iron_scrap', weight: 10 }]);
      if (matId) {
        addItem(userId, matId, 1, { pending: true });
        dropMsgs.push((getDb().prepare('SELECT name FROM items WHERE id = ?').get(matId) as { name: string }).name);
      }
    } else if (rematchKind === 'high_mat') {
      const matId = pickHighMaterialFromPool(rewardPool.length ? rewardPool : [{ item_id: 'upg_stone', weight: 10 }]);
      if (matId) {
        addItem(userId, matId, 1, { pending: true });
        dropMsgs.push((getDb().prepare('SELECT name FROM items WHERE id = ?').get(matId) as { name: string }).name);
      }
    } else if (rematchKind === 'equip') {
      const eqRarity = rollBattleEquipmentRarity(threat, lootTier);
      if (eqRarity) {
        const slot = resolveEquipSlot();
        const eqId = pickEquipmentFromAreaPool(rewardPool, eqRarity, slot);
        if (eqId) {
          addItem(userId, eqId, 1, { pending: true });
          dropMsgs.push((getDb().prepare('SELECT name FROM items WHERE id = ?').get(eqId) as { name: string }).name);
        }
      }
    }
    for (const [matId, cfg] of Object.entries(REMATCH_MATERIAL_BOSSES)) {
      if (cfg.monsterId !== session.monster_id) continue;
      if (roll(UNI_FORGE_DROP_RATE)) {
        addItem(userId, matId, 1, { pending: true });
        dropMsgs.push((getDb().prepare('SELECT name FROM items WHERE id = ?').get(matId) as { name: string }).name);
      }
    }
    for (const drop of PHASE2_UNI_MATERIAL_DROPS) {
      if (drop.monsterId !== session.monster_id) continue;
      if (roll(drop.rate)) {
        addItem(userId, drop.matId, 1, { pending: true });
        dropMsgs.push((getDb().prepare('SELECT name FROM items WHERE id = ?').get(drop.matId) as { name: string }).name);
      }
    }
  } else {
    const equipRarity = rollBattleEquipmentRarity(threat, lootTier);
    if (equipRarity && rewardPool.length) {
      const slot = resolveEquipSlot();
      const eqId = pickEquipmentFromAreaPool(rewardPool, equipRarity, slot);
      if (eqId) {
        addItem(userId, eqId, 1, { pending: true });
        dropMsgs.push((getDb().prepare('SELECT name FROM items WHERE id = ?').get(eqId) as { name: string }).name);
      }
    } else if (rewardPool.length && roll(0.35)) {
      const matPool = rewardPool.filter((p) => {
        const row = getDb().prepare('SELECT category FROM items WHERE id = ?').get(p.item_id) as { category: string } | undefined;
        return row && row.category !== 'equipment';
      });
      const pick = weightedChoice(matPool.length ? matPool : rewardPool);
      addItem(userId, pick.item_id, 1, { pending: true });
      dropMsgs.push((getDb().prepare('SELECT name FROM items WHERE id = ?').get(pick.item_id) as { name: string }).name);
    }
  }
  if (session.is_boss || threat === 'boss') {
    for (const drop of BOSS_VICTORY_MATERIAL_DROPS) {
      if (drop.monsterId !== session.monster_id) continue;
      const isFirst = wasFirstKill && !state.isRematch;
      const rate = isFirst ? drop.firstKillRate : drop.rematchRate;
      if (roll(rate)) {
        addItem(userId, drop.itemId, 1, { pending: true });
        dropMsgs.push((getDb().prepare('SELECT name FROM items WHERE id = ?').get(drop.itemId) as { name: string }).name);
      }
    }
  }
  if ((state.isRematch || !wasFirstKill) && SRC_FARM_MONSTER_IDS.includes(session.monster_id as typeof SRC_FARM_MONSTER_IDS[number]) && roll(SRC_FORGE_MATERIAL_DROP_RATE)) {
    addItem(userId, SRC_FORGE_MATERIAL_ID, 1, { pending: true });
    const mat = getDb().prepare('SELECT name FROM items WHERE id = ?').get(SRC_FORGE_MATERIAL_ID) as { name: string };
    dropMsgs.push(mat.name);
  }
  if (session.is_boss) incrementWeeklyProgress(userId, 'boss_kills');
  incrementWeeklyProgress(userId, 'explore_count');

  const lines: string[] = [];
  const battleTail = state.log.filter((l) => !l.includes('勝利') && !/打ち倒した|すべて倒した/.test(l)).slice(-4);
  if (battleTail.length) {
    lines.push('**戦闘の終わり**', ...battleTail, '');
  }
  lines.push('🔵 ' + (es.partySize > 1 ? '敵をすべて倒した。' : monster.name + 'を倒した。'));
  lines.push('');
  lines.push('**得たもの**');
  lines.push(`・経験値 +${exp}`);
  for (const jr of jobResults) {
    if (jr.expGained > 0) lines.push('・' + jr.jobName + '経験 +' + jr.expGained);
  }
  lines.push('・' + gold + 'G');
  if (dropMsgs.length) lines.push('・' + dropMsgs.join('、'));
  lines.push('');
  if (levelResult.leveledUp && levelResult.levelUpMessage) {
    lines.push(levelResult.levelUpMessage);
    lines.push('レベルアップによりHP/MPが回復した。');
    lines.push('');
  }
  lines.push(`Lv${levelResult.newLevel + 1} まであと ${levelResult.expToNext} EXP`);
  for (const jr of jobResults) {
    if (jr.leveledUp) lines.push('✦ ' + jr.jobName + ' Lv' + jr.newLevel + 'へ深まった。');
    else if (jr.expGained > 0 && jr.newLevel < 70) lines.push(getJobProgressText(userId, jr.jobName));
  }

  const skillLearned: Array<{ jobName: string; skills: string[] }> = [];
  const jobLeveledUp: string[] = [];
  for (const jr of jobResults) {
    if (jr.newSkills.length) skillLearned.push({ jobName: jr.jobName, skills: jr.newSkills });
    if (jr.leveledUp) jobLeveledUp.push(jr.jobName);
  }

  pushLog(state, 'info', '勝利。');
  return {
    done: true,
    status: 'victory' as BattleStatus,
    message: lines.join('\n'),
    sessionId,
    isRematch: state.isRematch ?? false,
    skillLearned: skillLearned.length ? skillLearned : undefined,
    jobLeveledUp: jobLeveledUp.length ? jobLeveledUp : undefined,
  };
}

function resolveDefeat(
  sessionId: string,
  userId: string,
  session: SessionRow,
  state: BattleState,
  pHp: number,
  pMp: number,
) {
  syncBattleResourcesToPlayer(userId, pHp, pMp);
  syncBattleStatusToPlayer(userId, state);
  endBattle(sessionId, 'defeat');
  const defeatMsg = isTrialBattleSession(session)
    ? applyTrialDefeat(userId)
    : applyDefeat(userId, session.is_boss === 1, session.area_id);
  return { done: true, status: 'defeat' as BattleStatus, message: defeatMsg, sessionId };
}

function persistBattle(
  sessionId: string,
  userId: string,
  pHp: number,
  pMp: number,
  eHp: number,
  eBreak: number,
  state: BattleState,
  enemyState?: EnemyStateJson,
): void {
  const es = enemyState ?? state.enemyState;
  const legacy = es ? syncLegacyEnemyColumns(es) : { monster_id: undefined, enemy_hp: eHp, enemy_break: eBreak };
  getDb().prepare(`UPDATE battle_sessions SET player_hp=?, player_mp=?, enemy_hp=?, enemy_break=?, enemy_state_json=?, status_json=?, turn_count=turn_count+1, updated_at=? WHERE id=?`)
    .run(pHp, pMp, legacy.enemy_hp, legacy.enemy_break, es ? serializeEnemyState(es) : null, JSON.stringify(state), nowIso(), sessionId);
  getDb().prepare('UPDATE players SET hp=?, mp=?, updated_at=? WHERE user_id=?').run(pHp, pMp, nowIso(), userId);
  persistPlayerPoisonFromBattle(userId, state.poisonTurns);
}

function endBattle(sessionId: string, status: BattleStatus): void {
  getDb().prepare('UPDATE battle_sessions SET status=?, updated_at=? WHERE id=?').run(status, nowIso(), sessionId);
}

export function getBattleDisplay(sessionId: string, userId: string) {
  const session = getDb().prepare('SELECT * FROM battle_sessions WHERE id = ? AND user_id = ?').get(sessionId, userId) as SessionRow | undefined;
  if (!session) return null;
  const state = parseState(session.status_json);
  const enemyState = resolveEnemyState(session, state);
  state.enemyState = enemyState;
  const monster = getPrimaryMonster(enemyState, session);
  const player = requirePlayer(userId);
  return { session, monster, player, state, enemyState };
}

export function buildBattleReply(battleId: string, userId: string) {
  const display = getBattleDisplay(battleId, userId);
  if (!display) return null;
  if (display.state.pendingAction) {
    return buildTargetSelectReply(battleId, userId, display);
  }
  const enemyHp = getEnemyHpDisplay(display.session, display.state, display.monster);
  const playerHp = getPlayerBattleDisplay(display.session, display.player);
  const es = display.enemyState;
  if (es && es.partySize > 1) {
    return {
      embeds: [battleEmbedMulti(
        '戦闘',
        playerHp.hp, display.player.max_hp, playerHp.mp, display.player.max_mp,
        es.enemies.filter((e) => e.is_alive),
        display.state.log,
        undefined,
        es.partySize,
      )],
      components: battleButtons(battleId, display.session.can_flee === 1),
    };
  }
  return {
    embeds: [battleEmbed(display.monster.name, playerHp.hp, display.player.max_hp, playerHp.mp, display.player.max_mp,
      display.monster.name, enemyHp.current, enemyHp.max, display.session.enemy_break, display.monster.break_max, display.state.log)],
    components: battleButtons(battleId, display.session.can_flee === 1),
  };
}

export function buildTargetSelectReply(
  battleId: string,
  userId: string,
  display?: NonNullable<ReturnType<typeof getBattleDisplay>>,
) {
  const d = display ?? getBattleDisplay(battleId, userId);
  if (!d) return null;
  const es = d.enemyState ?? resolveEnemyState(d.session, d.state);
  const alive = getAliveEnemies(es);
  const playerHp = getPlayerBattleDisplay(d.session, d.player);
  const pending = d.state.pendingAction;
  let note = '*攻撃する敵を選ぶ*';
  if (pending?.kind === 'skill' && pending.skillId) {
    const sk = getDb().prepare('SELECT name FROM skills WHERE id = ?').get(pending.skillId) as { name: string } | undefined;
    note = `*${sk?.name ?? '技'}* の対象を選ぶ`;
  }
  return {
    embeds: [battleEmbedMulti(
      '対象選択',
      playerHp.hp, d.player.max_hp, playerHp.mp, d.player.max_mp,
      alive,
      d.state.log,
      note,
      es.partySize,
    )],
    components: [
      targetSelectRow(battleId, alive, es.partySize),
      ...battleButtons(battleId, d.session.can_flee === 1).slice(0, 1),
    ],
  };
}

function targetSelectRow(battleId: string, enemies: EnemyInstance[], partySize = 1) {
  const row = new ActionRowBuilder<ButtonBuilder>();
  for (const e of enemies.slice(0, 3)) {
    const label = (partySize > 1 ? `${e.label}: ` : '') + e.name;
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`battle:${battleId}:target:${e.instance_id}`)
        .setLabel(label.slice(0, 80))
        .setStyle(ButtonStyle.Danger),
    );
  }
  return row;
}

export function buildSkillMenuReply(battleId: string, userId: string) {
  const display = getBattleDisplay(battleId, userId);
  if (!display) return null;
  const skills = getUsableBattleSkills(userId);
  if (!skills.length) return null;
  const canFlee = display.session.can_flee === 1;
  const enemyHp = getEnemyHpDisplay(display.session, display.state, display.monster);
  const playerHp = getPlayerBattleDisplay(display.session, display.player);
  return {
    embeds: [battleEmbed(
      '技と術',
      playerHp.hp, display.player.max_hp, playerHp.mp, display.player.max_mp,
      display.monster.name, enemyHp.current, enemyHp.max, display.session.enemy_break, display.monster.break_max,
      display.state.log, '*どの技を使う？*',
    )],
    components: [
      selectMenu(`battle:${battleId}:skill_pick`, '技を選ぶ', skills.map((s) => ({
        label: `${s.name} MP${s.mp_cost}`,
        value: s.id,
        description: `${skillTypeLabel(s.skill_type)} / ${scalingLabel(s.scaling_stat)}参照`,
      }))),
      ...battleButtons(battleId, canFlee).slice(0, 1),
    ],
  };
}

export function buildItemMenuReply(battleId: string, userId: string) {
  const display = getBattleDisplay(battleId, userId);
  if (!display) return null;
  const items = getDb().prepare(`
    SELECT pi.id AS inventory_id, i.name, pi.quantity
    FROM player_inventory pi JOIN items i ON pi.item_id = i.id
    WHERE pi.user_id = ? AND i.battle_usable = 1 AND pi.quantity > 0
    ORDER BY i.name LIMIT 25
  `).all(userId) as Array<{ inventory_id: number; name: string; quantity: number }>;
  if (!items.length) return null;
  const canFlee = display.session.can_flee === 1;
  const enemyHp = getEnemyHpDisplay(display.session, display.state, display.monster);
  const playerHp = getPlayerBattleDisplay(display.session, display.player);
  return {
    embeds: [battleEmbed(
      '所持品',
      playerHp.hp, display.player.max_hp, playerHp.mp, display.player.max_mp,
      display.monster.name, enemyHp.current, enemyHp.max, display.session.enemy_break, display.monster.break_max,
      display.state.log, '*戦いで使える品*',
    )],
    components: [
      selectMenu(`battle:${battleId}:item_pick`, '品を選ぶ', items.map((i) => ({
        label: i.name, value: String(i.inventory_id), description: `×${i.quantity}`,
      }))),
      ...battleButtons(battleId, canFlee).slice(0, 1),
    ],
  };
}
