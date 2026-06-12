import { getDb } from '../db/database';
import { addExp, addGold, requirePlayer, recalculatePlayerStats } from './playerSystem';
import { addItem } from './inventorySystem';
import { getRaid, getRaidMultiplier } from './raidSystem';
import { incrementWeeklyProgress } from './weeklySystem';
import { triggerBossDefeated } from './storySystem';
import { generateRaidAccessoryMetadata } from '../db/seedData/phase2Seed';
import { roll, randomInt, uuid } from '../utils/random';
import { nowIso } from '../types';
import { formatBattleLine } from '../utils/formatters';
import { getPlayerElementResistances, applyPlayerElementResist } from './elementSystem';
import { calcPlayerDamageToEnemy, calcEnemyDamageToPlayer } from './combatMath';

type ParticipantState = {
  user_id: string; hp: number; mp: number; max_hp: number; max_mp: number;
  action: string | null; skill_id: string | null; ready: number;
  attack: number; magic: number; defense: number; spirit: number; speed: number;
};

type RaidBattleRow = {
  id: string; raid_session_id: string; monster_id: string;
  enemy_hp: number; enemy_max_hp: number; enemy_break: number;
  participant_states_json: string; status_json: string; status: string;
};

const RAID_BOSS = 'mon_deep_core_boss';

export function getRaidBattle(raidSessionId: string): RaidBattleRow | undefined {
  return getDb().prepare('SELECT * FROM raid_battle_sessions WHERE raid_session_id = ? AND status = ? ORDER BY created_at DESC LIMIT 1')
    .get(raidSessionId, 'active') as RaidBattleRow | undefined;
}

export function startRaidBattle(raidSessionId: string): { ok: boolean; message: string; battleId?: string } {
  const raid = getRaid(raidSessionId) as { participants_json: string; status: string; leader_id: string } | undefined;
  if (!raid || raid.status !== 'in_progress') return { ok: false, message: 'レイドが進行中ではありません。' };

  const existing = getRaidBattle(raidSessionId);
  if (existing) return { ok: true, message: 'レイド戦闘中。', battleId: existing.id };

  const participants = JSON.parse(raid.participants_json) as string[];
  const mult = getRaidMultiplier(participants.length);
  const monster = getDb().prepare('SELECT * FROM monsters WHERE id = ?').get(RAID_BOSS) as {
    hp: number; name: string; attack: number; magic: number; defense: number; spirit: number; break_max: number; element?: string | null;
  };
  const enemyMaxHp = Math.floor(monster.hp * mult.hp * 1.15);
  const states: ParticipantState[] = [];

  for (const uid of participants) {
    recalculatePlayerStats(uid);
    const p = requirePlayer(uid);
    states.push({
      user_id: uid, hp: p.hp, mp: p.mp, max_hp: p.max_hp, max_mp: p.max_mp,
      action: null, skill_id: null, ready: 0,
      attack: p.attack, magic: p.magic, defense: p.defense, spirit: p.spirit, speed: p.speed,
    });
  }

  const id = uuid();
  const statusJson = { log: [formatBattleLine('info', `${monster.name}が立ちはだかる。\n深層炉心の熱が、肌を焼く。`)], enemyBroken: false };
  getDb().prepare(`
    INSERT INTO raid_battle_sessions (id, raid_session_id, monster_id, enemy_hp, enemy_max_hp, enemy_break, participant_states_json, status_json, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 0, ?, ?, 'active', ?, ?)
  `).run(id, raidSessionId, RAID_BOSS, enemyMaxHp, enemyMaxHp, JSON.stringify(states), JSON.stringify(statusJson), nowIso(), nowIso());

  return { ok: true, message: `レイド戦闘開始！\n${monster.name} HP:${enemyMaxHp}\n参加者${participants.length}人`, battleId: id };
}

export function setRaidAction(battleId: string, userId: string, action: string, skillId?: string): string {
  const battle = getDb().prepare('SELECT * FROM raid_battle_sessions WHERE id = ?').get(battleId) as RaidBattleRow | undefined;
  if (!battle || battle.status !== 'active') return '戦闘が見つかりません。';

  const states = JSON.parse(battle.participant_states_json) as ParticipantState[];
  const p = states.find((s) => s.user_id === userId);
  if (!p) return '参加者ではありません。';
  p.action = action;
  p.skill_id = skillId ?? null;
  p.ready = 1;
  getDb().prepare('UPDATE raid_battle_sessions SET participant_states_json = ?, updated_at = ? WHERE id = ?')
    .run(JSON.stringify(states), nowIso(), battleId);

  if (states.every((s) => s.ready === 1)) {
    return processRaidTurn(battleId);
  }
  return '行動を選んだ。仲間の準備を待っている…';
}

function processRaidTurn(battleId: string): string {
  const battle = getDb().prepare('SELECT * FROM raid_battle_sessions WHERE id = ?').get(battleId) as RaidBattleRow;
  const monster = getDb().prepare('SELECT * FROM monsters WHERE id = ?').get(battle.monster_id) as {
    name: string; attack: number; defense: number; spirit: number; break_max: number; exp_reward: number; gold_reward: number; element?: string | null;
  };
  let states = JSON.parse(battle.participant_states_json) as ParticipantState[];
  const status = JSON.parse(battle.status_json) as { log: string[]; enemyBroken: boolean };
  let eHp = battle.enemy_hp;
  let eBreak = battle.enemy_break;

  for (const p of states.filter((s) => s.hp > 0)) {
    if (p.action === 'defend') {
      status.log.push(formatBattleLine('player_attack', `<@${p.user_id}> が構えを取った。`));
      continue;
    }
    const mult = p.action === 'skill' ? 1.5 : 1.0;
    const stat = p.action === 'skill' ? p.magic : p.attack;
    const def = p.action === 'skill' ? monster.spirit : monster.defense;
    const baseDmg = calcPlayerDamageToEnemy(stat, def, mult);
    const dmg = Math.max(1, Math.floor(baseDmg * (status.enemyBroken ? 1.25 : 1)));
    eHp -= dmg;
    eBreak += dmg * 0.4;
    status.log.push(formatBattleLine('player_attack', `<@${p.user_id}> の攻撃。\n　**${dmg}** ダメージ。`));
    p.action = null;
    p.ready = 0;
  }

  if (eBreak >= monster.break_max) status.enemyBroken = true;

  if (eHp > 0) {
    const alive = states.filter((s) => s.hp > 0);
    const target = alive[randomInt(0, alive.length - 1)]!;
    const rawDmg = calcEnemyDamageToPlayer({
      attack: Math.floor(monster.attack * 1.15),
      playerDefense: target.defense,
      playerMaxHp: target.max_hp,
      threatTier: 'boss',
      takenMult: target.action === 'defend' ? 0.45 : 1,
    });
    const mit = applyPlayerElementResist(rawDmg, monster.element, getPlayerElementResistances(target.user_id));
    target.hp -= mit.damage;
    status.log.push(formatBattleLine('enemy_attack', `${monster.name}の攻撃。\n　<@${target.user_id}>に **${mit.damage}** ダメージ。`));
    if (mit.logText) status.log.push(formatBattleLine('status', mit.logText));
    for (const s of states) { s.action = null; s.ready = 0; }
  }

  if (status.log.length > 8) status.log = status.log.slice(-8);

  if (eHp <= 0) {
    getDb().prepare("UPDATE raid_battle_sessions SET status='victory', updated_at=? WHERE id=?").run(nowIso(), battleId);
    getDb().prepare("UPDATE raid_sessions SET status='completed', updated_at=? WHERE id=?").run(nowIso(), battle.raid_session_id);
    return distributeRaidRewards(battle.raid_session_id, states, monster, true);
  }
  if (states.every((s) => s.hp <= 0)) {
    getDb().prepare("UPDATE raid_battle_sessions SET status='defeat', updated_at=? WHERE id=?").run(nowIso(), battleId);
    getDb().prepare("UPDATE raid_sessions SET status='failed', updated_at=? WHERE id=?").run(nowIso(), battle.raid_session_id);
    return 'レイド敗北…灯火に導かれ、要塞の休息所へ戻された。';
  }

  getDb().prepare(`
    UPDATE raid_battle_sessions SET enemy_hp=?, enemy_break=?, participant_states_json=?, status_json=?, turn_count=turn_count+1, updated_at=? WHERE id=?
  `).run(eHp, eBreak, JSON.stringify(states), JSON.stringify(status), nowIso(), battleId);

  return `ターン進行。\n${monster.name} HP:${eHp}/${battle.enemy_max_hp}\n${status.log[status.log.length - 1] ?? ''}`;
}

function distributeRaidRewards(raidSessionId: string, states: ParticipantState[], monster: { exp_reward: number; gold_reward: number; name: string }, firstClear: boolean): string {
  const raid = getRaid(raidSessionId) as { participants_json: string };
  const count = (JSON.parse(raid.participants_json) as string[]).length;
  const mult = getRaidMultiplier(count);
  const lines = [`**${monster.name}**を撃破した！`, ''];

  for (const p of states) {
    const exp = Math.floor(monster.exp_reward * (firstClear ? 3 : 1.5) * (count === 1 ? 0.8 : 1));
    const gold = Math.floor(monster.gold_reward * 2 * (1 + mult.rewardBonus * 0.1));
    addExp(p.user_id, exp);
    addGold(p.user_id, gold);
    incrementWeeklyProgress(p.user_id, 'boss_kills');
    incrementWeeklyProgress(p.user_id, 'raid_joins');
    if (firstClear) triggerBossDefeated(p.user_id, RAID_BOSS);
    if (roll(firstClear ? 1 : 0.1)) addItem(p.user_id, 'wpn_valhalla_blade', 1);
    else if (roll(0.12)) addItem(p.user_id, 'acc_raid_random', 1, { metadata: generateRaidAccessoryMetadata() });
    else addItem(p.user_id, 'raid_deep_core', randomInt(1, 2 + mult.rewardBonus));
    lines.push(`<@${p.user_id}> EXP+${exp} / ${gold}G`);
  }
  return lines.join('\n');
}

export function formatRaidBattleStatus(battleId: string): string {
  const battle = getDb().prepare('SELECT * FROM raid_battle_sessions WHERE id = ?').get(battleId) as RaidBattleRow | undefined;
  if (!battle) return '戦闘なし';
  const states = JSON.parse(battle.participant_states_json) as ParticipantState[];
  const status = JSON.parse(battle.status_json) as { log: string[] };
  const mon = getDb().prepare('SELECT name FROM monsters WHERE id = ?').get(battle.monster_id) as { name: string };
  const party = states.map((s) => `<@${s.user_id}> HP${s.hp}/${s.max_hp}${s.ready ? ' ✓' : ''}`).join('\n');
  return [
    `**${mon.name}** HP:${battle.enemy_hp}/${battle.enemy_max_hp}`,
    party,
    '',
    ...(status.log.slice(-4)),
  ].join('\n');
}
