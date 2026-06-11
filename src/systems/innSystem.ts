import { getDb } from '../db/database';
import { requirePlayer, spendGold } from './playerSystem';
import { nowIso } from '../types';

export function calcInnCost(userId: string, townId: string): number {
  const player = requirePlayer(userId);
  const town = getDb().prepare('SELECT required_level FROM towns WHERE id = ?').get(townId) as { required_level: number } | undefined;
  const townTier = town?.required_level ?? 1;
  const lv = player.level;

  if (townId === 'valhalla_fortress' || townTier >= 55) {
    return Math.min(1500, 800 + Math.floor(lv * 8));
  }
  if (townTier >= 40 || lv >= 45) {
    return Math.min(700, 300 + Math.floor(lv * 6));
  }
  if (townTier >= 20 || lv >= 25) {
    return Math.min(250, 100 + Math.floor(lv * 4));
  }
  return Math.min(80, 30 + Math.floor(lv * 3));
}

export function restAtInn(userId: string, townId: string, freeHeal = false): {
  paid: boolean;
  relief: boolean;
  cost: number;
  message: string;
} {
  const player = requirePlayer(userId);
  const cost = calcInnCost(userId, townId);

  if (freeHeal) {
    getDb().prepare('UPDATE players SET hp=max_hp, mp=max_mp, updated_at=? WHERE user_id=?').run(nowIso(), userId);
    return { paid: false, relief: false, cost: 0, message: '深く息を吐くと、体の芯まで温かさが戻ってきた。\nHPとMPが全回復した。' };
  }

  if (player.gold >= cost && spendGold(userId, cost)) {
    getDb().prepare('UPDATE players SET hp=max_hp, mp=max_mp, updated_at=? WHERE user_id=?').run(nowIso(), userId);
    return {
      paid: true,
      relief: false,
      cost,
      message: [
        `宿泊費: **${cost}G**`,
        `所持金: **${player.gold - cost}G**`,
        '',
        '休むとHP/MPが全回復し、状態異常が解除されます。',
        '',
        '深く眠り、傷と疲れを癒した。',
      ].join('\n'),
    };
  }

  const reliefHp = Math.floor(player.max_hp * 0.4);
  const reliefMp = Math.floor(player.max_mp * 0.2);
  getDb().prepare('UPDATE players SET hp=?, mp=?, updated_at=? WHERE user_id=?').run(reliefHp, reliefMp, nowIso(), userId);
  return {
    paid: false,
    relief: true,
    cost,
    message: [
      `宿泊費: **${cost}G**`,
      `所持金: **${player.gold}G**`,
      '',
      '十分なゴールドがありません。',
      '宿泊はできませんが、最低限の手当てを受けます。',
      '',
      `HPが40%（${reliefHp}）まで回復しました。`,
    ].join('\n'),
  };
}

export function shrineHeal(userId: string, townId: string): { message: string } {
  const cost = Math.max(20, Math.floor(calcInnCost(userId, townId) * 0.6));
  const player = requirePlayer(userId);
  if (player.gold >= cost && spendGold(userId, cost)) {
    getDb().prepare('UPDATE players SET hp=max_hp, mp=max_mp, updated_at=? WHERE user_id=?').run(nowIso(), userId);
    return {
      message: `救護の手当てを受けた。（-${cost}G）\nHP/MPが全回復した。`,
    };
  }
  const reliefHp = Math.floor(player.max_hp * 0.35);
  const reliefMp = Math.floor(player.max_mp * 0.15);
  getDb().prepare('UPDATE players SET hp=?, mp=?, updated_at=? WHERE user_id=?').run(reliefHp, reliefMp, nowIso(), userId);
  return {
    message: `寄付が足りないが、最低限の手当てだけは受けられた。\nHP ${reliefHp} / MP ${reliefMp} まで回復。`,
  };
}

export function formatInnPreview(userId: string, townId: string): string {
  const player = requirePlayer(userId);
  const cost = calcInnCost(userId, townId);
  return [
    `宿泊費: **${cost}G**`,
    `所持金: **${player.gold}G**`,
    '',
    '休むとHP/MPが全回復し、状態異常が解除されます。',
  ].join('\n');
}
