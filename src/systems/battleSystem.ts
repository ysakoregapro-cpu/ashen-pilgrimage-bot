import { getDb } from '../db/database';
import { getDifficultyModifiers } from './difficultySystem';
import { calcBattleExp, calcBossExp } from './expSystem';
import { SRC_FORGE_MATERIAL_ID, SRC_FORGE_MATERIAL_DROP_RATE } from '../db/seedData/awakeningMaster';
import {
  REMATCH_MATERIAL_BOSSES, UNI_FORGE_DROP_RATE, SRC_FARM_MONSTER_IDS,
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
import { applyDefeat } from './defeatSystem';
import { incrementWeeklyProgress } from './weeklySystem';
import { getUsableBattleSkills, isUsableBattleSkill, skillTypeLabel, scalingLabel, type SkillRow } from './skillSystem';
import { grantBattleJobExp, getJobProgressText } from './jobLevelSystem';
import { roll, uuid, randomInt, weightedChoice } from '../utils/random';
import {
  getAreaLootTier, rollBattleEquipmentRarity, resolveEquipSlot, pickEquipmentFromAreaPool,
  pickMaterialFromPool, pickHighMaterialFromPool, rollRematchGenericLoot,
  type BattleThreatTier,
} from './equipmentDropSystem';
import { nowIso, type BattleStatus } from '../types';
import { formatBattleLine, type BattleLogType } from '../utils/formatters';
import { battleButtons, battleEmbed, selectMenu } from '../utils/embeds';
import {
  scaleMonsterForBattle, calcPhysicalDamage, calcEnemyDamageToPlayer,
  getThreatLabel, type ScaledMonster,
} from './combatMath';

export interface BattleState extends BattleStatusState {
  defending: boolean;
  enemyBroken: boolean;
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
}

type MonsterRow = {
  id: string; name: string; level: number; attack: number; magic: number; defense: number; spirit: number; speed: number;
  break_max: number; exp_reward: number; gold_reward: number; drop_pool_json: string; ai_pattern_json: string; hp: number;
  area_tag?: string; element?: string | null; weaknesses_json?: string | null; resistances_json?: string | null;
  is_boss?: number;
};

type SessionRow = {
  id: string; monster_id: string; area_id: string | null; player_hp: number; player_mp: number;
  enemy_hp: number; enemy_break: number; status_json: string; is_boss: number; is_raid: number;
  is_event_battle: number; can_flee: number; status: BattleStatus;
};

const ACTION_PRIORITY: Record<string, number> = { defend: 20, item: 10, attack: 0, skill: 0 };

export function getActiveBattle(userId: string) {
  return getDb().prepare(`SELECT * FROM battle_sessions WHERE user_id = ? AND status = 'active' ORDER BY created_at DESC LIMIT 1`).get(userId);
}

function countCompletedBattles(userId: string): number {
  const row = getDb().prepare(`SELECT COUNT(*) AS c FROM battle_sessions WHERE user_id = ? AND status IN ('victory', 'defeat', 'fled')`).get(userId) as { c: number };
  return row.c;
}

export function createBattle(userId: string, monsterId: string, areaId: string | null, opts?: { isBoss?: boolean; isRaid?: boolean; isEvent?: boolean; isRematch?: boolean }): string {
  const player = requirePlayer(userId);
  recalculatePlayerStats(userId);
  const p = requirePlayer(userId);
  const monster = getDb().prepare('SELECT * FROM monsters WHERE id = ?').get(monsterId) as MonsterRow | undefined;
  if (!monster) throw new Error('Monster not found');
  if (getActiveBattle(userId)) throw new Error('既に戦闘中です。');

  const isBoss = opts?.isBoss ?? false;
  const isRaid = opts?.isRaid ?? false;
  const isEvent = opts?.isEvent ?? false;
  const isRematch = opts?.isRematch ?? false;
  const canFlee = (!isBoss && !isRaid && !isEvent) ? 1 : 0;
  const tutorialBattle = monsterId === 'mon_star_slime' && countCompletedBattles(userId) === 0;
  const scaled = scaleMonsterForBattle(
    { ...monster, id: monsterId, area_tag: monster.area_tag ?? 'starfield' },
    { forceBoss: isBoss, isStoryBoss: isBoss },
  );
  const id = uuid();
  const threatLine = getThreatLabel(scaled.threatTier, monster.name);
  const state: BattleState = {
    ...mergeStatusState({}),
    defending: false, enemyBroken: false, usedRevive: false,
    fleeBonus: 0, atkBuff: 0, magBuff: 0, defBuff: 0, trapActive: false,
    hitBonus: 0, breakBonus: 0, guardStrong: false,
    combatScale: scaled,
    isRematch,
    log: tutorialBattle
      ? [formatBattleLine('info', monster.name + 'が現れた。…最初の一歩。油断は禁物だ。')]
      : [
        formatBattleLine('info', monster.name + 'が現れた！'),
        ...(threatLine && scaled.threatTier !== 'normal' ? [formatBattleLine('info', threatLine)] : []),
      ],
    tutorialBattle,
  };

  getDb().prepare(`
    INSERT INTO battle_sessions (id, user_id, area_id, monster_id, player_hp, player_mp, enemy_hp, enemy_break, status_json, is_boss, is_raid, is_event_battle, can_flee, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, 'active', ?, ?)
  `).run(id, userId, areaId, monsterId, p.hp, p.mp, scaled.hp, JSON.stringify(state),
    isBoss ? 1 : 0, isRaid ? 1 : 0, isEvent ? 1 : 0, canFlee, nowIso(), nowIso());
  return id;
}

function parseState(json: string): BattleState {
  const s = JSON.parse(json) as Partial<BattleState>;
  return {
    ...mergeStatusState(s),
    defending: s.defending ?? false,
    enemyBroken: s.enemyBroken ?? false,
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
  };
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
  opts?: { skillId?: string; inventoryId?: number },
): { done: boolean; status: BattleStatus; message: string; sessionId: string; notify?: string; skillLearned?: Array<{ jobName: string; skills: string[] }>; jobLeveledUp?: string[] } {
  const session = getSession(sessionId, userId);
  if (!session || session.status !== 'active') {
    return { done: true, status: 'defeat', message: '戦闘が見つかりません。', sessionId };
  }

  const monster = getDb().prepare('SELECT * FROM monsters WHERE id = ?').get(session.monster_id) as MonsterRow;
  const player = requirePlayer(userId);
  let state = parseState(session.status_json);
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
      endBattle(sessionId, 'fled');
      return { done: true, status: 'fled', message: '足音を消し、戦いから離れた。', sessionId };
    }
    pushLog(state, 'flee_fail', '逃げ道を塞がれた。\n　敵が追撃してくる。');
    const er = executeEnemyTurn(monster, player, state, diff, tutorial, pHp, eHp, eBreak, session.is_boss === 1);
    ({ pHp, eHp, eBreak, state } = er);
    if (pHp <= 0) return resolveDefeat(sessionId, userId, session, state);
    persistBattle(sessionId, userId, pHp, pMp, eHp, eBreak, state);
    return { done: false, status: 'active', message: state.log[state.log.length - 1] ?? '', sessionId };
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
  skill?: SkillRow, _invId?: number,
) {
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
        const r = executePlayerAction(action, skill, userId, player, monster, state, diff, pHp, pMp, eHp, eBreak, session.is_boss === 1);
        pHp = r.pHp; pMp = r.pMp; eHp = r.eHp; eBreak = r.eBreak; state = r.state;
      }
      if (eHp <= 0) {
    pushLog(state, 'info', `${monster.name}を打ち倒した。`);
    return resolveVictory(sessionId, userId, session, monster, state);
  }
      if (pHp <= 0) return resolveDefeat(sessionId, userId, session, state);
    } else {
      const r = executeEnemyTurn(monster, player, state, diff, tutorial, pHp, eHp, eBreak, session.is_boss === 1);
      pHp = r.pHp; eHp = r.eHp; eBreak = r.eBreak; state = r.state;
      if (pHp <= 0) return resolveDefeat(sessionId, userId, session, state);
      if (eHp <= 0) {
    pushLog(state, 'info', `${monster.name}を打ち倒した。`);
    return resolveVictory(sessionId, userId, session, monster, state);
  }
    }
  }

  const tick = tickStatusEffects(state, pHp, player.max_hp, eHp, monster.name, session.is_boss === 1);
  pHp = tick.pHp; eHp = tick.eHp;
  for (const line of tick.logs) pushLog(state, 'status', line);
  if (eHp <= 0) {
    pushLog(state, 'info', `${monster.name}を打ち倒した。`);
    return resolveVictory(sessionId, userId, session, monster, state);
  }
  if (pHp <= 0) return resolveDefeat(sessionId, userId, session, state);

  state.defending = false;
  state.guardStrong = false;
  persistBattle(sessionId, userId, pHp, pMp, eHp, eBreak, state);
  return { done: false, status: 'active' as BattleStatus, message: state.log[state.log.length - 1] ?? '', sessionId };
}

function executePlayerAction(
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
      const dmg = applyElementDamage(result.damage, wpnEl, monster, (line) => pushLog(state, 'player_attack', line));
      eHp -= dmg;
      eBreak += dmg * 0.3 * diff.breakRate + state.breakBonus;
      pushLog(state, 'player_attack', `あなたの攻撃。\n　${monster.name}に **${dmg}** ダメージ${result.crit ? '（会心）' : ''}。`);
      checkBreak(state, monster, eBreak);
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

function applySkill(skill: SkillRow, player: ReturnType<typeof requirePlayer>, monster: MonsterRow, state: BattleState, diff: ReturnType<typeof getDifficultyModifiers>, pHp: number, pMp: number, eHp: number, eBreak: number, isBoss: boolean) {
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
    checkBreak(state, monster, eBreak);
    return { pHp, pMp, eHp, eBreak, state };
  }

  const hits = skill.hits ?? 1;
  const isMag = ['magic', 'divine', 'machine'].includes(skill.skill_type);
  const def = Math.floor((isMag ? scale.spirit * statusMods.enemyMagMult : scale.defense) * statusMods.enemyDefMult);
  let stat = getScalingStat(player, skill.scaling_stat);
  if (skill.secondary_scaling_stat) stat = Math.floor((stat + getScalingStat(player, skill.secondary_scaling_stat)) / 2);
  const mult = diff.playerDamage * skill.power * (1 + (isMag ? state.magBuff : state.atkBuff));

  for (let i = 0; i < hits; i++) {
    const result = calcDamage(stat, def, player.crit_rate, player.crit_damage, mult / hits, diff.playerHitRate + (skill.hit_bonus ?? 0) + statusMods.hitPenalty, skill.crit_bonus ?? 0, state.hitBonus);
    if (result.hit) {
      const dmg = applyElementDamage(result.damage, skill.element, monster, (line) => pushLog(state, 'player_skill', line));
      eHp -= dmg;
      eBreak += (skill.break_power ?? 0) * diff.breakRate + state.breakBonus;
      const logType: BattleLogType = skill.skill_type === 'divine' ? 'player_divine' : skill.skill_type === 'magic' ? 'player_skill' : 'player_attack';
      pushLog(state, logType, `${skill.name}${hits > 1 ? `（${i + 1}）` : ''}。\n　${monster.name}に **${dmg}** ダメージ。`);
    } else pushLog(state, 'player_skill', `${skill.name}。\n　外れた。`);
  }

  if (statusTarget) {
    const statusResult = attemptApplyEnemyStatus({
      state,
      effect: statusTarget.effect,
      duration: statusTarget.duration,
      isBoss,
      threatTier: scale.threatTier,
      skillSuccessRate: statusTarget.skillRate,
      monsterName: monster.name,
    });
    for (const line of statusResult.logs) pushLog(state, 'status', line);
    eBreak += statusResult.breakBonus;
  }

  checkBreak(state, monster, eBreak);

  return { pHp, pMp, eHp, eBreak, state };
}

function checkBreak(state: BattleState, monster: MonsterRow, eBreak: number): void {
  if (!state.enemyBroken && eBreak >= monster.break_max) {
    state.enemyBroken = true;
    pushLog(state, 'break', `${monster.name}の体勢が崩れた。\n　次の攻撃が通りやすい。`);
  }
}

function executeEnemyTurn(monster: MonsterRow, player: ReturnType<typeof requirePlayer>, state: BattleState, diff: ReturnType<typeof getDifficultyModifiers>, tutorial: boolean, pHp: number, eHp: number, eBreak: number, isBoss: boolean) {
  if (state.trapActive) {
    eBreak += 15 + state.breakBonus;
    state.trapActive = false;
    pushLog(state, 'break', '罠が炸裂した。\n　体勢を崩しやすくなった。');
    checkBreak(state, monster, eBreak);
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
  if (state.enemyBroken) dmg = Math.floor(dmg * 0.75);
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

function resolveVictory(sessionId: string, userId: string, session: SessionRow, monster: MonsterRow, state: BattleState) {
  const wasFirstKill = session.is_boss ? hasBossFirstKill(userId, session.monster_id) : false;
  endBattle(sessionId, 'victory');
  const player = requirePlayer(userId);
  const scale = getCombatScale(state, monster);
  const tierExpMult = scale.threatTier === 'rare' ? 1.85 : scale.threatTier === 'elite' ? 1.9 : scale.threatTier === 'tough' ? 1.35 : 1;
  const tierGoldMult = scale.threatTier === 'rare' ? 1.75 : scale.threatTier === 'elite' ? 1.85 : scale.threatTier === 'tough' ? 1.3 : 1;
  const rematchMult = state.isRematch ? 0.55 : 1;
  let exp = calcBattleExp(Math.floor(monster.exp_reward * tierExpMult * rematchMult), player.level, monster.level);
  if (session.is_boss) {
    const first = state.isRematch ? false : wasFirstKill;
    exp = calcBossExp(calcBattleExp(Math.floor(monster.exp_reward * tierExpMult * rematchMult), player.level, monster.level), first);
  }
  const gold = Math.floor(monster.gold_reward * tierGoldMult * 1.2 * rematchMult);
  const levelResult = addExp(userId, exp);
  const jobResults = grantBattleJobExp(userId, exp);
  addGold(userId, gold);
  // Pending rewards are confirmed on town return; battle victory keeps them pending until then
  const dropMsgs: string[] = [];
  const areaRow = session.area_id
    ? getDb().prepare('SELECT reward_pool_json, recommended_min_level, town_id FROM exploration_areas WHERE id = ?').get(session.area_id) as {
      reward_pool_json: string; recommended_min_level: number; town_id: string;
    } | undefined
    : undefined;
  const rewardPool = areaRow
    ? JSON.parse(areaRow.reward_pool_json) as Array<{ item_id: string; weight: number }>
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
  if ((state.isRematch || !wasFirstKill) && SRC_FARM_MONSTER_IDS.includes(session.monster_id as typeof SRC_FARM_MONSTER_IDS[number]) && roll(SRC_FORGE_MATERIAL_DROP_RATE)) {
    addItem(userId, SRC_FORGE_MATERIAL_ID, 1, { pending: true });
    const mat = getDb().prepare('SELECT name FROM items WHERE id = ?').get(SRC_FORGE_MATERIAL_ID) as { name: string };
    dropMsgs.push(mat.name);
  }
  if (session.is_boss) incrementWeeklyProgress(userId, 'boss_kills');
  incrementWeeklyProgress(userId, 'explore_count');

  const lines: string[] = [];
  const battleTail = state.log.filter((l) => !l.includes('勝利')).slice(-4);
  if (battleTail.length) {
    lines.push('**戦闘の終わり**', ...battleTail, '');
  }
  lines.push('🔵 ' + monster.name + 'を倒した。');
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

function resolveDefeat(sessionId: string, userId: string, session: SessionRow, state: BattleState) {
  endBattle(sessionId, 'defeat');
  return { done: true, status: 'defeat' as BattleStatus, message: applyDefeat(userId, session.is_boss === 1, session.area_id), sessionId };
}

function persistBattle(sessionId: string, userId: string, pHp: number, pMp: number, eHp: number, eBreak: number, state: BattleState): void {
  getDb().prepare(`UPDATE battle_sessions SET player_hp=?, player_mp=?, enemy_hp=?, enemy_break=?, status_json=?, turn_count=turn_count+1, updated_at=? WHERE id=?`)
    .run(pHp, pMp, eHp, eBreak, JSON.stringify(state), nowIso(), sessionId);
  getDb().prepare('UPDATE players SET hp=?, mp=?, updated_at=? WHERE user_id=?').run(pHp, pMp, nowIso(), userId);
}

function endBattle(sessionId: string, status: BattleStatus): void {
  getDb().prepare('UPDATE battle_sessions SET status=?, updated_at=? WHERE id=?').run(status, nowIso(), sessionId);
}

export function getBattleDisplay(sessionId: string, userId: string) {
  const session = getDb().prepare('SELECT * FROM battle_sessions WHERE id = ? AND user_id = ?').get(sessionId, userId) as SessionRow | undefined;
  if (!session) return null;
  const monster = getDb().prepare('SELECT * FROM monsters WHERE id = ?').get(session.monster_id) as MonsterRow;
  const player = requirePlayer(userId);
  const state = parseState(session.status_json);
  return { session, monster, player, state };
}

export function buildBattleReply(battleId: string, userId: string) {
  const display = getBattleDisplay(battleId, userId);
  if (!display) return null;
  const enemyHp = getEnemyHpDisplay(display.session, display.state, display.monster);
  const playerHp = getPlayerBattleDisplay(display.session, display.player);
  return {
    embeds: [battleEmbed(display.monster.name, playerHp.hp, display.player.max_hp, playerHp.mp, display.player.max_mp,
      display.monster.name, enemyHp.current, enemyHp.max, display.session.enemy_break, display.monster.break_max, display.state.log)],
    components: battleButtons(battleId, display.session.can_flee === 1),
  };
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
