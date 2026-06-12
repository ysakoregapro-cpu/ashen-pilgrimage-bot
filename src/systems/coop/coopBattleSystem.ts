import { getDb } from '../../db/database';
import { nowIso } from '../../types';
import { uuid, randomInt, roll } from '../../utils/random';
import { formatBattleLine } from '../../utils/formatters';
import { requirePlayer, recalculatePlayerStats } from '../playerSystem';
import { getSkill, type SkillRow } from '../skillSystem';
import { calcPlayerDamageToEnemy, calcEnemyDamageToPlayer } from '../combatMath';
import { getPlayerElementResistances, applyPlayerElementResist } from '../elementSystem';
import { removeItem } from '../inventorySystem';
import {
  statBlockFromPlayer,
  calcSkillHitDamage,
  calcSkillHeal,
  resolveSkillEffectMeta,
} from '../skillBattleCore';
import {
  COOP_TURN_DEADLINE_MS,
  COOP_RESOLVE_LOCK_STALE_MS,
  RESCUE_HP_MULT,
  RAID_HP_MULT,
  RAID_BOSS_ID,
  type CoopActionTarget,
  type CoopActionType,
  type CoopBattleMeta,
  type CoopEnemyState,
  type CoopMode,
  type CoopParticipantState,
} from './coopTypes';
import {
  getCoopRecruit,
  getCoopMembers,
  parseCoopContext,
  completeCoopRecruit,
} from './coopRecruitSystem';

export type CoopBattleRow = {
  id: string;
  recruit_id: string;
  mode: CoopMode;
  status: string;
  enemy_json: string;
  participant_states_json: string;
  turn_count: number;
  status_json: string;
  resolving_lock: string | null;
  turn_deadline_at: string | null;
  channel_id: string | null;
  message_id: string | null;
  created_at: string;
  updated_at: string;
};

type StoredAction = {
  action_type: CoopActionType;
  skill_id: string | null;
  item_id: string | null;
  target_json: string | null;
};

function hpMult(mode: CoopMode, count: number): number {
  const table = mode === 'raid' ? RAID_HP_MULT : RESCUE_HP_MULT;
  return table[count] ?? table[2] ?? 1.6;
}

function defaultMeta(leaderId: string): CoopBattleMeta {
  return {
    log: [],
    breakRemainingHits: 0,
    playerBreakDamageMult: 1.25,
    enemyNextAtkReducePct: 0.2,
    enemyNextAtkReduceActive: false,
    enemyBroken: false,
    raidTelegraph: false,
    raidHeavyPending: false,
    leader_id: leaderId,
  };
}

function pushLog(meta: CoopBattleMeta, type: string, text: string): void {
  meta.log.push(formatBattleLine(type as 'info', text));
  if (meta.log.length > 10) meta.log = meta.log.slice(-10);
}

function parseParticipants(json: string): CoopParticipantState[] {
  return JSON.parse(json) as CoopParticipantState[];
}

function parseEnemy(json: string): CoopEnemyState {
  return JSON.parse(json) as CoopEnemyState;
}

function parseMeta(json: string): CoopBattleMeta {
  return JSON.parse(json) as CoopBattleMeta;
}

function livingParticipants(states: CoopParticipantState[]): CoopParticipantState[] {
  return states.filter((p) => !p.defeated && p.hp > 0);
}

function actionCapable(states: CoopParticipantState[]): CoopParticipantState[] {
  return states.filter((p) => !p.defeated && p.hp > 0);
}

export function getCoopBattle(battleId: string): CoopBattleRow | undefined {
  return getDb().prepare('SELECT * FROM coop_battle_sessions WHERE id = ?').get(battleId) as CoopBattleRow | undefined;
}

export function getCoopBattleByRecruit(recruitId: string): CoopBattleRow | undefined {
  return getDb().prepare('SELECT * FROM coop_battle_sessions WHERE recruit_id = ?').get(recruitId) as CoopBattleRow | undefined;
}

export function createCoopBattleFromRecruit(recruitId: string): { ok: boolean; message: string; battleId?: string } {
  const recruit = getCoopRecruit(recruitId);
  if (!recruit) return { ok: false, message: '募集が見つかりません。' };

  const existing = getCoopBattleByRecruit(recruitId);
  if (existing) return { ok: true, message: '協力戦進行中。', battleId: existing.id };

  const members = getCoopMembers(recruitId);
  const count = members.length;
  const ctx = parseCoopContext(recruit.context_json);
  const monsterId = ctx.monster_id ?? (recruit.mode === 'raid' ? RAID_BOSS_ID : 'mon_bandit');

  const monster = getDb().prepare('SELECT * FROM monsters WHERE id = ?').get(monsterId) as {
    id: string; name: string; hp: number; attack: number; magic: number; defense: number; spirit: number;
    break_max: number; element: string | null; exp_reward: number; gold_reward: number; area_tag: string;
  } | undefined;
  if (!monster) return { ok: false, message: '敵データが見つかりません。' };

  const mult = hpMult(recruit.mode, count);
  const enemyMaxHp = Math.floor(monster.hp * mult * (recruit.mode === 'raid' ? 1.15 : 1));
  const participants: CoopParticipantState[] = [];

  for (const m of members) {
    recalculatePlayerStats(m.user_id);
    const p = requirePlayer(m.user_id);
    participants.push({
      user_id: m.user_id,
      role: m.role,
      hp: p.hp,
      mp: p.mp,
      max_hp: p.max_hp,
      max_mp: p.max_mp,
      attack: p.attack,
      magic: p.magic,
      defense: p.defense,
      spirit: p.spirit,
      speed: p.speed,
      poisonTurns: 0,
      playerSilence: 0,
      defending: false,
      tauntActive: false,
      coverTarget: null,
      defeated: p.hp <= 0,
      atkBuff: 0,
      magBuff: 0,
      defBuff: 0,
    });
  }

  const enemy: CoopEnemyState = {
    monster_id: monster.id,
    name: monster.name,
    hp: enemyMaxHp,
    max_hp: enemyMaxHp,
    break: 0,
    break_max: monster.break_max || 100,
    attack: Math.floor(monster.attack * (recruit.mode === 'raid' ? 1.15 : 1.05)),
    magic: monster.magic,
    defense: monster.defense,
    spirit: monster.spirit,
    element: monster.element,
    exp_reward: monster.exp_reward,
    gold_reward: monster.gold_reward,
  };

  const meta = defaultMeta(recruit.leader_id);
  pushLog(meta, 'info', `${monster.name}との協力戦が始まった。（${count}人）`);

  const id = uuid();
  const deadline = new Date(Date.now() + COOP_TURN_DEADLINE_MS).toISOString();
  getDb().prepare(`
    INSERT INTO coop_battle_sessions (id, recruit_id, mode, status, enemy_json, participant_states_json, turn_count, status_json, turn_deadline_at, created_at, updated_at)
    VALUES (?, ?, ?, 'active', ?, ?, 1, ?, ?, ?, ?)
  `).run(id, recruitId, recruit.mode, JSON.stringify(enemy), JSON.stringify(participants), JSON.stringify(meta), deadline, nowIso(), nowIso());

  return { ok: true, message: `協力戦開始！\n${monster.name} HP:${enemyMaxHp}\n参加者${count}人`, battleId: id };
}

export function getPendingActionCount(battleId: string, turnCount: number): number {
  const battle = getCoopBattle(battleId);
  if (!battle) return 0;
  const participants = actionCapable(parseParticipants(battle.participant_states_json));
  const submitted = getDb().prepare(`
    SELECT COUNT(*) AS c FROM coop_battle_actions WHERE battle_id = ? AND turn_count = ?
  `).get(battleId, turnCount) as { c: number };
  return Math.max(0, participants.length - submitted.c);
}

function getStoredAction(battleId: string, userId: string, turnCount: number): StoredAction | undefined {
  return getDb().prepare(`
    SELECT action_type, skill_id, item_id, target_json FROM coop_battle_actions
    WHERE battle_id = ? AND user_id = ? AND turn_count = ?
  `).get(battleId, userId, turnCount) as StoredAction | undefined;
}

export function submitCoopAction(
  battleId: string,
  userId: string,
  actionType: CoopActionType,
  opts?: { skillId?: string; itemId?: number; target?: CoopActionTarget },
): { ok: boolean; message: string; needsTarget?: boolean; resolve?: boolean } {
  const battle = getCoopBattle(battleId);
  if (!battle) return { ok: false, message: '戦闘が見つかりません。' };
  if (battle.status === 'resolving') return { ok: false, message: '現在ターン処理中です。' };
  if (!['active', 'pending'].includes(battle.status)) return { ok: false, message: 'この戦闘は終了しています。' };

  const participants = parseParticipants(battle.participant_states_json);
  const self = participants.find((p) => p.user_id === userId);
  if (!self) return { ok: false, message: '参加者ではありません。' };
  if (self.defeated || self.hp <= 0) return { ok: false, message: '戦闘不能のため行動できません。' };

  if (actionType === 'skill' && opts?.skillId) {
    const skill = getSkill(opts.skillId);
    if (!skill) return { ok: false, message: 'その技は使えません。' };
    if (self.mp < skill.mp_cost) return { ok: false, message: 'MPが足りません。' };
    if (self.playerSilence > 0 && ['magic', 'divine', 'prayer'].includes(skill.skill_type)) {
      return { ok: false, message: '沈黙中はその技が使えません。' };
    }
    const needsTarget = needsTargetSelection(skill, actionType);
    if (needsTarget && !opts.target) {
      return { ok: false, message: '対象を選んでください。', needsTarget: true };
    }
  }

  if (actionType === 'item' && opts?.itemId) {
    if (!opts.target) return { ok: false, message: '対象を選んでください。', needsTarget: true };
  }

  const targetJson = opts?.target ? JSON.stringify(opts.target) : null;
  const now = nowIso();

  try {
    getDb().prepare(`
      INSERT INTO coop_battle_actions (battle_id, user_id, turn_count, action_type, skill_id, item_id, target_json, submitted_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(battle_id, user_id, turn_count) DO UPDATE SET
        action_type = excluded.action_type,
        skill_id = excluded.skill_id,
        item_id = excluded.item_id,
        target_json = excluded.target_json,
        submitted_at = excluded.submitted_at
    `).run(battleId, userId, battle.turn_count, actionType, opts?.skillId ?? null, opts?.itemId?.toString() ?? null, targetJson, now);
  } catch {
    return { ok: false, message: '行動の登録に失敗しました。' };
  }

  getDb().prepare("UPDATE coop_members SET status = 'action_submitted' WHERE recruit_id = ? AND user_id = ?")
    .run(battle.recruit_id, userId);

  const pending = getPendingActionCount(battleId, battle.turn_count);
  if (pending === 0) {
    const result = tryResolveCoopTurn(battleId);
    return { ok: true, message: result.message, resolve: true };
  }
  return { ok: true, message: `行動を登録した。残り${pending}人の入力待ち…` };
}

export function needsTargetSelection(skill: SkillRow | undefined, actionType: CoopActionType): boolean {
  if (actionType === 'item') return true;
  if (actionType !== 'skill' || !skill) return false;
  const t = skill.target_type ?? 'single';
  return !['self', 'all_enemies', 'all_allies', 'taunt'].includes(t);
}

export function autoDefendMissingActions(battleId: string): boolean {
  const battle = getCoopBattle(battleId);
  if (!battle || battle.status !== 'active') return false;
  if (!battle.turn_deadline_at) return false;
  if (new Date(battle.turn_deadline_at).getTime() > Date.now()) return false;

  const participants = actionCapable(parseParticipants(battle.participant_states_json));
  for (const p of participants) {
    const existing = getStoredAction(battleId, p.user_id, battle.turn_count);
    if (!existing) {
      submitCoopAction(battleId, p.user_id, 'defend');
    }
  }
  return true;
}

function acquireResolveLock(battleId: string): boolean {
  const lockId = uuid();
  const staleBefore = new Date(Date.now() - COOP_RESOLVE_LOCK_STALE_MS).toISOString();
  const r = getDb().prepare(`
    UPDATE coop_battle_sessions SET resolving_lock = ?, status = 'resolving', updated_at = ?
    WHERE id = ? AND status = 'active'
      AND (resolving_lock IS NULL OR updated_at <= ?)
  `).run(lockId, nowIso(), battleId, staleBefore);
  if (r.changes === 0) return false;
  const row = getCoopBattle(battleId);
  return row?.resolving_lock === lockId;
}

function releaseResolveLock(battleId: string, nextStatus: string): void {
  const deadline = new Date(Date.now() + COOP_TURN_DEADLINE_MS).toISOString();
  getDb().prepare(`
    UPDATE coop_battle_sessions SET resolving_lock = NULL, status = ?, turn_deadline_at = ?, updated_at = ? WHERE id = ?
  `).run(nextStatus, deadline, nowIso(), battleId);
}

export function tryResolveCoopTurn(battleId: string): { ok: boolean; message: string; finished?: boolean } {
  autoDefendMissingActions(battleId);
  const battle = getCoopBattle(battleId);
  if (!battle || battle.status === 'victory' || battle.status === 'defeat') {
    return { ok: false, message: '戦闘は終了しています。' };
  }

  const pending = getPendingActionCount(battleId, battle.turn_count);
  if (pending > 0) return { ok: false, message: `まだ${pending}人の行動待ちです。` };

  if (!acquireResolveLock(battleId)) {
    return { ok: false, message: '現在ターン処理中です。' };
  }

  try {
    return resolveCoopTurnLocked(battleId);
  } catch (e) {
    releaseResolveLock(battleId, 'active');
    throw e;
  }
}

function resolveCoopTurnLocked(battleId: string): { ok: boolean; message: string; finished?: boolean } {
  const battle = getCoopBattle(battleId)!;
  let participants = parseParticipants(battle.participant_states_json);
  let enemy = parseEnemy(battle.enemy_json);
  const meta = parseMeta(battle.status_json);
  const turn = battle.turn_count;
  const mode = battle.mode as CoopMode;
  const recruit = getCoopRecruit(battle.recruit_id)!;
  const playerCount = participants.length;

  for (const p of participants) {
    p.defending = false;
    p.coverTarget = null;
    p.tauntActive = false;
  }

  const actions = getDb().prepare(`
    SELECT user_id, action_type, skill_id, item_id, target_json FROM coop_battle_actions
    WHERE battle_id = ? AND turn_count = ?
  `).all(battleId, turn) as Array<{
    user_id: string; action_type: CoopActionType; skill_id: string | null; item_id: string | null; target_json: string | null;
  }>;

  for (const act of actions) {
    const p = participants.find((x) => x.user_id === act.user_id);
    if (!p || p.defeated || p.hp <= 0) continue;
    const target = act.target_json ? JSON.parse(act.target_json) as CoopActionTarget : undefined;

    if (act.action_type === 'defend') {
      p.defending = true;
      pushLog(meta, 'player_attack', `<@${p.user_id}> が構えを取った。`);
      continue;
    }

    if (act.action_type === 'attack') {
      const dmg = applyPlayerDamage(p, enemy, meta, false, 1);
      enemy.hp -= dmg;
      enemy.break += dmg * 0.35;
      pushLog(meta, 'player_attack', `<@${p.user_id}> の攻撃。\n　**${dmg}** ダメージ。`);
      checkBreak(enemy, meta);
      continue;
    }

    if (act.action_type === 'skill' && act.skill_id) {
      applyCoopSkill(p, participants, enemy, meta, act.skill_id, target, mode);
      continue;
    }

    if (act.action_type === 'item' && act.item_id) {
      applyCoopItem(p, participants, Number(act.item_id), target, meta);
    }
  }

  applyPoisonTick(participants, meta);

  if (enemy.hp > 0) {
    resolveEnemyTurn(participants, enemy, meta, mode, playerCount, turn);
  }

  for (const p of participants) {
    if (p.hp <= 0 && !p.defeated) {
      p.defeated = true;
      pushLog(meta, 'status', `<@${p.user_id}> は戦闘不能になった。`);
      getDb().prepare("UPDATE coop_members SET status = 'defeated' WHERE recruit_id = ? AND user_id = ?")
        .run(battle.recruit_id, p.user_id);
    }
  }

  const alive = livingParticipants(participants);
  let finished = false;
  let message = '';

  if (enemy.hp <= 0) {
    getDb().prepare(`
      UPDATE coop_battle_sessions SET enemy_json = ?, participant_states_json = ?, status_json = ?, status = 'victory', resolving_lock = NULL, updated_at = ?
      WHERE id = ?
    `).run(JSON.stringify(enemy), JSON.stringify(participants), JSON.stringify(meta), nowIso(), battleId);
    completeCoopRecruit(battle.recruit_id);
    const { grantCoopBattleRewards, applyRescueLeaderRecovery } = require('./coopRewardSystem') as typeof import('./coopRewardSystem');
    const rewardMsg = grantCoopBattleRewards(battleId, participants, enemy, meta.leader_id, mode);
    if (mode === 'rescue') applyRescueLeaderRecovery(meta.leader_id, participants);
    finished = true;
    message = `勝利！\n${rewardMsg}`;
  } else if (alive.length === 0) {
    getDb().prepare(`
      UPDATE coop_battle_sessions SET enemy_json = ?, participant_states_json = ?, status_json = ?, status = 'defeat', resolving_lock = NULL, updated_at = ?
      WHERE id = ?
    `).run(JSON.stringify(enemy), JSON.stringify(participants), JSON.stringify(meta), nowIso(), battleId);
    completeCoopRecruit(battle.recruit_id);
    finished = true;
    message = mode === 'rescue'
      ? '救難失敗…灯火に導かれ、町へ戻された。'
      : 'レイド敗北…要塞の休息所へ戻された。';
  } else {
    const nextTurn = turn + 1;
    if (mode === 'raid' && nextTurn % 3 === 0) {
      meta.raidTelegraph = true;
      pushLog(meta, 'status', '⚠️ **大技予兆** — 次ターン強攻撃！防御で被害軽減。');
    }
    getDb().prepare(`
      UPDATE coop_battle_sessions SET enemy_json = ?, participant_states_json = ?, status_json = ?, turn_count = ?, updated_at = ?
      WHERE id = ?
    `).run(JSON.stringify(enemy), JSON.stringify(participants), JSON.stringify(meta), nextTurn, nowIso(), battleId);

    for (const m of getCoopMembers(battle.recruit_id)) {
      const ps = participants.find((x) => x.user_id === m.user_id);
      const st = ps && !ps.defeated && ps.hp > 0 ? 'action_pending' : (ps?.defeated ? 'watching' : 'defeated');
      getDb().prepare('UPDATE coop_members SET status = ? WHERE recruit_id = ? AND user_id = ?')
        .run(st, battle.recruit_id, m.user_id);
    }
    releaseResolveLock(battleId, 'active');
    message = formatCoopTurnSummary(enemy, participants, meta, nextTurn);
  }

  return { ok: true, message, finished };
}

function applyPlayerDamage(
  p: CoopParticipantState,
  enemy: CoopEnemyState,
  meta: CoopBattleMeta,
  isMagic: boolean,
  mult: number,
): number {
  const stat = isMagic ? p.magic : p.attack;
  const def = isMagic ? enemy.spirit : enemy.defense;
  let dmg = calcPlayerDamageToEnemy(stat, def, mult);
  if (meta.breakRemainingHits > 0) {
    dmg = Math.floor(dmg * meta.playerBreakDamageMult);
    meta.breakRemainingHits--;
  }
  return Math.max(1, dmg);
}

function checkBreak(enemy: CoopEnemyState, meta: CoopBattleMeta): void {
  if (enemy.break >= enemy.break_max && !meta.enemyBroken) {
    meta.enemyBroken = true;
    meta.breakRemainingHits = 2;
    meta.enemyNextAtkReduceActive = true;
    meta.enemyNextAtkReducePct = 0.2;
    meta.raidHeavyPending = false;
    enemy.break = 0;
    pushLog(meta, 'break', '**ブレイク発動！** 次の攻撃が強化される。');
  }
}

function applyCoopSkill(
  caster: CoopParticipantState,
  participants: CoopParticipantState[],
  enemy: CoopEnemyState,
  meta: CoopBattleMeta,
  skillId: string,
  target: CoopActionTarget | undefined,
  mode: CoopMode,
): void {
  const skill = getSkill(skillId);
  if (!skill) return;
  caster.mp = Math.max(0, caster.mp - skill.mp_cost);
  const stats = statBlockFromPlayer(caster.user_id);
  const effect = skill.effect_type ?? '';
  const fx = resolveSkillEffectMeta(skill);
  const isMag = ['magic', 'divine', 'machine', 'prayer'].includes(skill.skill_type);
  const enemyDef = isMag ? enemy.spirit : enemy.defense;

  if (skill.skill_type === 'recovery' || effect === 'heal') {
    const allies = resolveAllies(caster, participants, skill, target);
    for (const ally of allies) {
      const heal = calcSkillHeal(stats, skill);
      ally.hp = Math.min(ally.max_hp, ally.hp + heal);
      pushLog(meta, 'player_heal', `<@${caster.user_id}> ${skill.name} → <@${ally.user_id}> **${heal}**`);
    }
    return;
  }

  if (effect === 'guard' || effect === 'guard_strong') {
    caster.defending = true;
    pushLog(meta, 'player_attack', `<@${caster.user_id}> ${skill.name}（${effect === 'guard_strong' ? '強' : ''}防御）`);
    return;
  }

  if (effect === 'cure_poison') {
    const allies = resolveAllies(caster, participants, skill, target);
    for (const ally of allies) {
      ally.poisonTurns = 0;
      pushLog(meta, 'player_heal', `<@${ally.user_id}> の毒が治った。`);
    }
    return;
  }

  if (skill.skill_type === 'guard' || skill.target_type === 'cover' || effect === 'cover') {
    const cover = resolveSingleAlly(caster, participants, target);
    if (cover && !cover.defeated) {
      caster.coverTarget = cover.user_id;
      pushLog(meta, 'player_attack', `<@${caster.user_id}> が <@${cover.user_id}> をかばう構え。`);
    }
    return;
  }

  if (skill.target_type === 'taunt' || effect === 'taunt') {
    caster.tauntActive = true;
    pushLog(meta, 'player_attack', `<@${caster.user_id}> ${skill.name}（挑発）`);
    return;
  }

  if (effect === 'mag_buff') { caster.magBuff += 0.2; pushLog(meta, 'player_skill', `<@${caster.user_id}> 魔力強化`); return; }
  if (effect === 'atk_buff') { caster.atkBuff += 0.2; pushLog(meta, 'player_skill', `<@${caster.user_id}> 攻撃強化`); return; }
  if (effect === 'def_buff') { caster.defBuff += 0.15; pushLog(meta, 'player_heal', `<@${caster.user_id}> 防御強化`); return; }
  if (effect === 'scan') { pushLog(meta, 'player_skill', `<@${caster.user_id}> 弱点看破`); enemy.break += 10; checkBreak(enemy, meta); return; }

  const aoeMult = (skill.target_type === 'all_enemies' || skill.target_type === 'all') ? 0.72 : 1;
  const hits = skill.hits ?? 1;

  if (skill.power <= 0 && (skill.break_power > 0 || skill.status_effect)) {
    if (skill.break_power > 0) {
      enemy.break += skill.break_power;
      pushLog(meta, 'break', `<@${caster.user_id}> ${skill.name} ブレイク+${skill.break_power}`);
      checkBreak(enemy, meta);
    }
    applyCoopStatusEffect(caster, enemy, meta, skill, mode, fx);
    return;
  }

  for (let i = 0; i < hits; i++) {
    const result = calcSkillHitDamage(stats, skill, enemyDef, {
      atkBuff: caster.atkBuff,
      magBuff: caster.magBuff,
      perHitMult: aoeMult / hits,
    });
    if (!result.hit) {
      pushLog(meta, 'player_skill', `<@${caster.user_id}> ${skill.name} 外れた`);
      continue;
    }
    let dmg = result.damage;
    if (meta.breakRemainingHits > 0) {
      dmg = Math.floor(dmg * meta.playerBreakDamageMult);
      meta.breakRemainingHits--;
    }
    enemy.hp -= dmg;
    enemy.break += (skill.break_power ?? 0) + dmg * 0.25;
    const critTag = result.crit ? '（会心）' : '';
    pushLog(meta, isMag ? 'player_skill' : 'player_attack', `<@${caster.user_id}> ${skill.name}${hits > 1 ? `(${i + 1})` : ''} **${dmg}**${critTag}`);
    checkBreak(enemy, meta);
  }

  applyCoopStatusEffect(caster, enemy, meta, skill, mode, fx);
}

function applyCoopStatusEffect(
  caster: CoopParticipantState,
  enemy: CoopEnemyState,
  meta: CoopBattleMeta,
  skill: SkillRow,
  mode: CoopMode,
  fx: ReturnType<typeof resolveSkillEffectMeta>,
): void {
  const status = skill.status_effect ?? fx.statusEffect;
  if (!status) return;

  if (mode === 'raid') {
    if (status === 'poison' || status === 'silence' || status === 'bind') {
      meta.enemyNextAtkReduceActive = true;
      meta.enemyNextAtkReducePct = Math.max(meta.enemyNextAtkReducePct, 0.15);
      if (status === 'silence') meta.raidHeavyPending = false;
      pushLog(meta, 'status', `${skill.name}: レイドボスは状態異常を弱体化として受けた。`);
      return;
    }
  }

  if (status === 'poison') {
    pushLog(meta, 'status', `${skill.name}: 敵に毒がかかった（coop簡略）。`);
    meta.enemyNextAtkReduceActive = true;
  }
}

function resolveSingleAlly(
  caster: CoopParticipantState,
  participants: CoopParticipantState[],
  target?: CoopActionTarget,
): CoopParticipantState | undefined {
  if (target?.user_id) {
    return participants.find((p) => p.user_id === target.user_id && !p.defeated && p.hp > 0);
  }
  return participants.find((p) => p.user_id !== caster.user_id && !p.defeated && p.hp > 0);
}

function resolveAllies(
  caster: CoopParticipantState,
  participants: CoopParticipantState[],
  skill: SkillRow,
  target?: CoopActionTarget,
): CoopParticipantState[] {
  const tt = skill.target_type ?? 'self';
  if (tt === 'all_allies') return participants.filter((p) => !p.defeated);
  if (tt === 'self') return [caster];
  if (tt === 'lowest_hp_ally') {
    const alive = participants.filter((p) => !p.defeated && p.hp > 0);
    alive.sort((a, b) => a.hp / a.max_hp - b.hp / b.max_hp);
    return alive[0] ? [alive[0]] : [];
  }
  const ally = resolveSingleAlly(caster, participants, target);
  return ally ? [ally] : [caster];
}

function applyCoopItem(
  user: CoopParticipantState,
  participants: CoopParticipantState[],
  inventoryId: number,
  target: CoopActionTarget | undefined,
  meta: CoopBattleMeta,
): void {
  const row = getDb().prepare(`
    SELECT pi.id, pi.quantity, i.name, i.battle_effect_json
    FROM player_inventory pi JOIN items i ON pi.item_id = i.id
    WHERE pi.id = ? AND pi.user_id = ? AND i.battle_usable = 1 AND pi.quantity > 0
  `).get(inventoryId, user.user_id) as { id: number; quantity: number; name: string; battle_effect_json: string | null } | undefined;
  if (!row?.battle_effect_json) return;

  let ally = user;
  if (target?.user_id && target.user_id !== user.user_id) {
    const found = participants.find((p) => p.user_id === target.user_id);
    if (!found || found.defeated || found.hp <= 0) return;
    ally = found;
  }

  const effect = JSON.parse(row.battle_effect_json) as { type: string; value?: number };
  if (effect.type === 'heal_hp') {
    const heal = effect.value ?? 50;
    ally.hp = Math.min(ally.max_hp, ally.hp + heal);
    pushLog(meta, 'player_heal', `<@${user.user_id}> → <@${ally.user_id}> ${row.name} **+${heal}**`);
  } else if (effect.type === 'cure_poison') {
    ally.poisonTurns = 0;
    pushLog(meta, 'player_heal', `<@${ally.user_id}> の毒が治った。`);
  }
  removeItem(user.user_id, row.id, 1);
}

function applyPoisonTick(participants: CoopParticipantState[], meta: CoopBattleMeta): void {
  for (const p of participants) {
    if (p.defeated || p.hp <= 0 || p.poisonTurns <= 0) continue;
    const dmg = Math.max(1, Math.floor(p.max_hp * 0.04));
    p.hp -= dmg;
    p.poisonTurns--;
    pushLog(meta, 'status', `<@${p.user_id}> 毒 **${dmg}**`);
  }
}

function pickEnemyTarget(participants: CoopParticipantState[]): CoopParticipantState {
  const alive = livingParticipants(participants);
  const taunters = alive.filter((p) => p.tauntActive);
  if (taunters.length && roll(0.65)) return taunters[randomInt(0, taunters.length - 1)]!;
  return alive[randomInt(0, alive.length - 1)]!;
}

function resolveEnemyTurn(
  participants: CoopParticipantState[],
  enemy: CoopEnemyState,
  meta: CoopBattleMeta,
  mode: CoopMode,
  playerCount: number,
  turn: number,
): void {
  let atkMult = 1;
  if (meta.enemyNextAtkReduceActive) {
    atkMult *= 1 - meta.enemyNextAtkReducePct;
    meta.enemyNextAtkReduceActive = false;
  }

  const heavy = meta.raidHeavyPending || (mode === 'raid' && meta.raidTelegraph);
  meta.raidTelegraph = false;
  meta.raidHeavyPending = false;

  if (mode === 'raid' && playerCount >= 4 && roll(0.35)) {
    for (const p of livingParticipants(participants)) {
      dealEnemyHit(p, participants, enemy, meta, atkMult, heavy, 0.55);
    }
    pushLog(meta, 'enemy_attack', `${enemy.name}の全体攻撃！`);
    return;
  }

  if (mode === 'raid' && playerCount >= 3 && roll(0.25)) {
    const targets = livingParticipants(participants).slice(0, 2);
    for (const p of targets) {
      dealEnemyHit(p, participants, enemy, meta, atkMult, heavy, 1);
    }
    return;
  }

  const target = pickEnemyTarget(participants);
  dealEnemyHit(target, participants, enemy, meta, atkMult, heavy, 1);
}

function dealEnemyHit(
  target: CoopParticipantState,
  participants: CoopParticipantState[],
  enemy: CoopEnemyState,
  meta: CoopBattleMeta,
  atkMult: number,
  heavy: boolean,
  mult: number,
): void {
  let actualTarget = target;
  const cover = participants.find((p) => p.coverTarget === target.user_id && !p.defeated && p.hp > 0);
  if (cover && roll(0.85)) {
    actualTarget = cover;
    actualTarget.defending = true;
    pushLog(meta, 'player_attack', `<@${cover.user_id}> が <@${target.user_id}> をかばった！`);
  }

  const takenMult = actualTarget.defending ? (heavy ? 0.35 : 0.45) : (heavy ? 1.2 : 1);
  const raw = calcEnemyDamageToPlayer({
    attack: Math.floor(enemy.attack * atkMult * mult),
    playerDefense: actualTarget.defense,
    playerMaxHp: actualTarget.max_hp,
    threatTier: 'boss',
    takenMult,
    heavy,
  });
  const mit = applyPlayerElementResist(raw, enemy.element, getPlayerElementResistances(actualTarget.user_id));
  actualTarget.hp -= mit.damage;
  pushLog(meta, 'enemy_attack', `${enemy.name}${heavy ? '（強攻撃）' : ''} → <@${actualTarget.user_id}> **${mit.damage}**`);
  if (heavy && modeRaidHint(meta)) {
    meta.raidHeavyPending = false;
  }
}

function modeRaidHint(_meta: CoopBattleMeta): boolean {
  return true;
}

function formatCoopTurnSummary(
  enemy: CoopEnemyState,
  participants: CoopParticipantState[],
  meta: CoopBattleMeta,
  turn: number,
): string {
  const party = participants.map((p) => {
    const tag = p.defeated || p.hp <= 0 ? '💀' : `HP${p.hp}/${p.max_hp}`;
    return `<@${p.user_id}> ${tag}`;
  }).join('\n');
  return [
    `ターン${turn}`,
    `**${enemy.name}** HP:${Math.max(0, enemy.hp)}/${enemy.max_hp} ブレイク:${Math.floor(enemy.break)}/${enemy.break_max}`,
    party,
    meta.log[meta.log.length - 1] ?? '',
  ].join('\n');
}

export function formatCoopBattleStatus(battleId: string): string {
  const battle = getCoopBattle(battleId);
  if (!battle) return '戦闘なし';
  const enemy = parseEnemy(battle.enemy_json);
  const participants = parseParticipants(battle.participant_states_json);
  const meta = parseMeta(battle.status_json);
  const pending = getPendingActionCount(battleId, battle.turn_count);
  const telegraph = meta.raidTelegraph ? '\n⚠️ **大技予兆中**' : '';
  const party = participants.map((p) => {
    if (p.defeated || p.hp <= 0) return `<@${p.user_id}> 戦闘不能/見守り`;
    const act = getStoredAction(battleId, p.user_id, battle.turn_count);
    return `<@${p.user_id}> HP${p.hp}/${p.max_hp} MP${p.mp}/${p.max_mp}${act ? ' ✓' : ''}`;
  }).join('\n');
  return [
    `**${enemy.name}** HP:${Math.max(0, enemy.hp)}/${enemy.max_hp}`,
    `ブレイク ${Math.floor(enemy.break)}/${enemy.break_max} | ターン${battle.turn_count}${telegraph}`,
    `行動待ち: ${pending}人`,
    party,
    '',
    ...(meta.log.slice(-4)),
  ].join('\n');
}

export function cleanupStaleCoopBattles(): number {
  const staleBefore = new Date(Date.now() - COOP_RESOLVE_LOCK_STALE_MS).toISOString();
  const r = getDb().prepare(`
    UPDATE coop_battle_sessions SET resolving_lock = NULL, status = 'expired', updated_at = ?
    WHERE status = 'resolving' AND updated_at <= ?
  `).run(nowIso(), staleBefore);
  return r.changes;
}

export function getActiveCoopBattleIds(): string[] {
  return (getDb().prepare("SELECT id FROM coop_battle_sessions WHERE status = 'active'").all() as Array<{ id: string }>)
    .map((r) => r.id);
}

export function validateCoopBattleAction(battleId: string, userId: string): { ok: boolean; message: string } {
  const battle = getCoopBattle(battleId);
  if (!battle) return { ok: false, message: 'この戦闘は終了しています。' };
  if (['victory', 'defeat', 'expired'].includes(battle.status)) {
    return { ok: false, message: 'この戦闘は終了しています。' };
  }
  if (battle.status === 'resolving') return { ok: false, message: '現在ターン処理中です。' };
  const participants = parseParticipants(battle.participant_states_json);
  const self = participants.find((p) => p.user_id === userId);
  if (!self) return { ok: false, message: '参加者ではありません。' };
  if (self.defeated || self.hp <= 0) return { ok: false, message: '戦闘不能のため行動できません。' };
  return { ok: true, message: '' };
}
