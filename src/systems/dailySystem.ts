import { getDb } from '../db/database';
import { addGold, requirePlayer } from './playerSystem';
import { addItem } from './inventorySystem';
import { todayKey, nowIso } from '../types';

const DAILY_REWARDS = [
  { gold: 100, items: [] as Array<{ id: string; qty: number }> },
  { gold: 150, items: [{ id: 'mat_iron_scrap', qty: 3 }] },
  { gold: 200, items: [{ id: 'upg_rough_stone', qty: 1 }] },
  { gold: 250, items: [{ id: 'mat_cloth_scrap', qty: 5 }] },
  { gold: 300, items: [{ id: 'upg_stone', qty: 1 }] },
  { gold: 400, items: [{ id: 'mat_starfield_grass', qty: 3 }] },
  { gold: 1000, items: [{ id: 'upg_fine_stone', qty: 2 }, { id: 'mat_small_mana', qty: 5 }], special: true },
];

export function claimDaily(userId: string): { success: boolean; message: string } {
  const today = todayKey();
  const existing = getDb().prepare('SELECT * FROM daily_claims WHERE user_id = ? AND claim_date = ?').get(userId, today);
  if (existing) return { success: false, message: '本日のデイリーボーナスは既に受け取り済みです。' };

  const tracking = getDb().prepare('SELECT * FROM player_stats_tracking WHERE user_id = ?').get(userId) as {
    login_streak: number; last_login_date: string | null;
  } | undefined;

  let streak = 1;
  if (tracking?.last_login_date) {
    const last = new Date(tracking.last_login_date);
    const now = new Date(today);
    const diff = (now.getTime() - last.getTime()) / 86400000;
    if (diff === 1) streak = (tracking.login_streak ?? 0) + 1;
    else if (diff > 1) streak = 1;
    else return { success: false, message: '本日のデイリーボーナスは既に受け取り済みです。' };
  }

  const dayIndex = ((streak - 1) % 7);
  const reward = DAILY_REWARDS[dayIndex]!;

  addGold(userId, reward.gold);
  for (const item of reward.items) addItem(userId, item.id, item.qty);

  getDb().prepare(`
    INSERT INTO daily_claims (user_id, claim_date, streak_day, reward_json, created_at) VALUES (?, ?, ?, ?, ?)
  `).run(userId, today, dayIndex + 1, JSON.stringify(reward), nowIso());

  getDb().prepare(`
    INSERT INTO player_stats_tracking (user_id, login_streak, last_login_date) VALUES (?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET login_streak = ?, last_login_date = ?
  `).run(userId, streak, today, streak, today);

  let msg = `デイリーボーナス（${dayIndex + 1}日目）\n+${reward.gold}G\n連続ログイン: ${streak}日`;
  if (reward.items.length) msg += '\n' + reward.items.map((i) => `${i.id} x${i.qty}`).join(', ');
  if (reward.special) msg += '\n🎁 週替わり宝箱ボーナス！';
  return { success: true, message: msg };
}

export function getDailyStatus(userId: string): string {
  const today = todayKey();
  const claimed = getDb().prepare('SELECT * FROM daily_claims WHERE user_id = ? AND claim_date = ?').get(userId, today);
  const tracking = getDb().prepare('SELECT * FROM player_stats_tracking WHERE user_id = ?').get(userId) as { login_streak: number } | undefined;
  if (claimed) return `本日受取済み。連続${tracking?.login_streak ?? 0}日。`;
  return `本日未受取。連続${tracking?.login_streak ?? 0}日。/daily claim で受け取れます。`;
}
