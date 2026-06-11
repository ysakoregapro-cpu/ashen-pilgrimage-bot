import { getDb } from '../db/database';
import { addExp, addGold, requirePlayer, recalculatePlayerStats } from './playerSystem';
import { addItem } from './inventorySystem';
import { incrementWeeklyProgress } from './weeklySystem';
import { applyDefeat } from './defeatSystem';
import { randomInt, uuid } from '../utils/random';
import { nowIso } from '../types';
import { formatBattleLine } from '../utils/formatters';
import { getPlayerElementResistances, applyPlayerElementResist } from './elementSystem';

type CoopParticipant = {
  user_id: string; role: 'requester' | 'helper';
  hp: number; mp: number; max_hp: number; max_mp: number;
  attack: number; defense: number; magic: number;
  action: string | null; ready: number;
};

export function startRescueBattle(rescueId: string): { ok: boolean; message: string; battleId?: string } {
  const req = getDb().prepare('SELECT * FROM rescue_requests WHERE id = ?').get(rescueId) as {
    requester_id: string; participants_json: string; battle_id: string | null; status: string; request_type: string;
  } | undefined;
  if (!req || !['open', 'in_progress'].includes(req.status)) return { ok: false, message: '救難要請が見つかりません。' };

  const existing = getDb().prepare('SELECT id FROM rescue_battle_sessions WHERE rescue_request_id = ? AND status = ?')
    .get(rescueId, 'active') as { id: string } | undefined;
  if (existing) return { ok: true, message: '救難戦闘中。', battleId: existing.id };

  let monsterId = 'mon_bandit';
  if (req.battle_id) {
    const sess = getDb().prepare('SELECT monster_id FROM battle_sessions WHERE id = ?').get(req.battle_id) as { monster_id: string } | undefined;
    if (sess) monsterId = sess.monster_id;
  }

  const monster = getDb().prepare('SELECT * FROM monsters WHERE id = ?').get(monsterId) as {
    hp: number; name: string; attack: number; defense: number; spirit: number; exp_reward: number; gold_reward: number; element?: string | null;
  };
  const helpers = JSON.parse(req.participants_json) as string[];
  const allIds = [req.requester_id, ...helpers];
  const hpMod = 1 + helpers.length * 0.4;
  const enemyHp = Math.floor(monster.hp * hpMod);

  const states: CoopParticipant[] = [];
  for (const uid of allIds) {
    recalculatePlayerStats(uid);
    const p = requirePlayer(uid);
    states.push({
      user_id: uid, role: uid === req.requester_id ? 'requester' : 'helper',
      hp: p.hp, mp: p.mp, max_hp: p.max_hp, max_mp: p.max_mp,
      attack: p.attack, defense: p.defense, magic: p.magic,
      action: null, ready: 0,
    });
  }

  const id = uuid();
  getDb().prepare(`
    INSERT INTO rescue_battle_sessions (id, rescue_request_id, battle_session_id, monster_id, enemy_hp, enemy_max_hp, participant_states_json, status_json, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)
  `).run(id, rescueId, req.battle_id, monsterId, enemyHp, enemyHp,
    JSON.stringify(states), JSON.stringify({ log: [formatBattleLine('info', `${monster.name}との戦いが再開した。`)] }),
    nowIso(), nowIso());
  getDb().prepare("UPDATE rescue_requests SET status='in_progress', updated_at=? WHERE id=?").run(nowIso(), rescueId);

  return { ok: true, message: `救難共闘開始！\n${monster.name} HP:${enemyHp}\n参加者${allIds.length}人`, battleId: id };
}

export function setRescueAction(battleId: string, userId: string, action: string): string {
  const battle = getDb().prepare('SELECT * FROM rescue_battle_sessions WHERE id = ?').get(battleId) as {
    participant_states_json: string; monster_id: string; enemy_hp: number; enemy_max_hp: number;
    status_json: string; rescue_request_id: string; status: string;
  } | undefined;
  if (!battle || battle.status !== 'active') return '戦闘が見つかりません。';

  const states = JSON.parse(battle.participant_states_json) as CoopParticipant[];
  const p = states.find((s) => s.user_id === userId);
  if (!p) return '参加者ではありません。';
  p.action = action;
  p.ready = 1;
  getDb().prepare('UPDATE rescue_battle_sessions SET participant_states_json=?, updated_at=? WHERE id=?')
    .run(JSON.stringify(states), nowIso(), battleId);

  if (states.every((s) => s.ready === 1 || s.hp <= 0)) {
    return processRescueTurn(battleId);
  }
  return '行動を選んだ。仲間の準備を待っている…';
}

function processRescueTurn(battleId: string): string {
  const battle = getDb().prepare('SELECT * FROM rescue_battle_sessions WHERE id = ?').get(battleId) as {
    participant_states_json: string; monster_id: string; enemy_hp: number; enemy_max_hp: number;
    status_json: string; rescue_request_id: string; id: string;
  };
  const monster = getDb().prepare('SELECT * FROM monsters WHERE id = ?').get(battle.monster_id) as {
    name: string; attack: number; defense: number; exp_reward: number; gold_reward: number; element?: string | null;
  };
  let states = JSON.parse(battle.participant_states_json) as CoopParticipant[];
  const status = JSON.parse(battle.status_json) as { log: string[] };
  let eHp = battle.enemy_hp;

  for (const p of states.filter((s) => s.hp > 0 && s.ready)) {
    const mult = p.action === 'skill' ? 1.4 : p.action === 'defend' ? 0 : 1;
    if (p.action === 'defend') {
      status.log.push(formatBattleLine('player_attack', `<@${p.user_id}> が構えた。`));
    } else {
      const dmg = Math.max(1, Math.floor(p.attack * mult - monster.defense * 0.4));
      eHp -= dmg;
      status.log.push(formatBattleLine('player_attack', `<@${p.user_id}> **${dmg}** ダメージ。`));
    }
    p.ready = 0;
    p.action = null;
  }

  if (eHp > 0) {
    const alive = states.filter((s) => s.hp > 0);
    const target = alive[randomInt(0, alive.length - 1)]!;
    const rawDmg = Math.max(1, Math.floor(monster.attack * 1.1 - target.defense * 0.35));
    const mit = applyPlayerElementResist(rawDmg, monster.element, getPlayerElementResistances(target.user_id));
    target.hp -= mit.damage;
    status.log.push(formatBattleLine('enemy_attack', `${monster.name} → <@${target.user_id}> **${mit.damage}**`));
    if (mit.logText) status.log.push(formatBattleLine('status', mit.logText));
  }

  if (eHp <= 0) {
    getDb().prepare("UPDATE rescue_battle_sessions SET status='victory', updated_at=? WHERE id=?").run(nowIso(), battleId);
    getDb().prepare("UPDATE rescue_requests SET status='completed', updated_at=? WHERE id=?").run(nowIso(), battle.rescue_request_id);
    return completeRescueBattle(battle.rescue_request_id, states, monster);
  }
  if (states.filter((s) => s.hp > 0).length === 0) {
    getDb().prepare("UPDATE rescue_battle_sessions SET status='defeat', updated_at=? WHERE id=?").run(nowIso(), battleId);
    getDb().prepare("UPDATE rescue_requests SET status='failed', updated_at=? WHERE id=?").run(nowIso(), battle.rescue_request_id);
    const req = getDb().prepare('SELECT requester_id FROM rescue_requests WHERE id = ?').get(battle.rescue_request_id) as { requester_id: string };
    return applyDefeat(req.requester_id, false, null);
  }

  getDb().prepare(`
    UPDATE rescue_battle_sessions SET enemy_hp=?, participant_states_json=?, status_json=?, turn_count=turn_count+1, updated_at=? WHERE id=?
  `).run(eHp, JSON.stringify(states), JSON.stringify(status), nowIso(), battleId);

  return `${monster.name} HP:${eHp}/${battle.enemy_max_hp}\n${status.log[status.log.length - 1] ?? ''}`;
}

function completeRescueBattle(rescueId: string, states: CoopParticipant[], monster: { exp_reward: number; gold_reward: number; name: string }): string {
  const req = getDb().prepare('SELECT requester_id FROM rescue_requests WHERE id = ?').get(rescueId) as { requester_id: string };
  const lines = [`救難成功！${monster.name}を倒した。`, ''];

  for (const p of states) {
    if (p.role === 'requester') {
      addExp(p.user_id, monster.exp_reward);
      addGold(p.user_id, monster.gold_reward);
      incrementWeeklyProgress(p.user_id, 'rescue_success');
      lines.push(`<@${p.user_id}>（主催）EXP+${monster.exp_reward} / ${monster.gold_reward}G`);
    } else {
      const exp = Math.floor(monster.exp_reward * 0.4);
      const gold = Math.floor(monster.gold_reward * 0.5);
      addExp(p.user_id, exp);
      addGold(p.user_id, gold);
      if (randomInt(0, 100) < 30) addItem(p.user_id, 'mat_iron_scrap', randomInt(1, 2));
      incrementWeeklyProgress(p.user_id, 'rescue_success');
      lines.push(`<@${p.user_id}>（参加）EXP+${exp} / ${gold}G`);
    }
  }
  return lines.join('\n');
}

export function getRescueBattleForRequest(rescueId: string) {
  return getDb().prepare('SELECT * FROM rescue_battle_sessions WHERE rescue_request_id = ? AND status = ? ORDER BY created_at DESC LIMIT 1')
    .get(rescueId, 'active');
}
