import { getDb } from '../db/database';
import { addItem } from './inventorySystem';
import { weekKey, nowIso } from '../types';

const MISSIONS = [
  { key: 'explore_count', label: '探索10回', target: 10 },
  { key: 'boss_kills', label: 'ボス3体討伐', target: 3 },
  { key: 'raid_joins', label: 'レイド1回参加', target: 1 },
  { key: 'rescue_success', label: '救難1回成功', target: 1 },
  { key: 'trade_count', label: '取引1回成立', target: 1 },
  { key: 'upgrade_count', label: '装備強化3回', target: 3 },
  { key: 'town_quest_count', label: '町クエスト5回', target: 5 },
] as const;

export function getWeeklyProgress(userId: string) {
  const wk = weekKey();
  let row = getDb().prepare('SELECT * FROM weekly_progress WHERE user_id = ? AND week_key = ?').get(userId, wk) as Record<string, number> | undefined;
  if (!row) {
    getDb().prepare(`
      INSERT INTO weekly_progress (user_id, week_key) VALUES (?, ?)
    `).run(userId, wk);
    row = getDb().prepare('SELECT * FROM weekly_progress WHERE user_id = ? AND week_key = ?').get(userId, wk) as Record<string, number>;
  }
  return row;
}

export function incrementWeeklyProgress(userId: string, key: typeof MISSIONS[number]['key'], amount = 1): void {
  const wk = weekKey();
  getWeeklyProgress(userId);
  getDb().prepare(`UPDATE weekly_progress SET ${key} = ${key} + ? WHERE user_id = ? AND week_key = ?`).run(amount, userId, wk);
}

export function formatWeeklyStatus(userId: string): string {
  const progress = getWeeklyProgress(userId);
  const lines = MISSIONS.map((m) => {
    const current = (progress[m.key] as number) ?? 0;
    const done = current >= m.target ? '✅' : '⬜';
    return `${done} ${m.label}: ${Math.min(current, m.target)}/${m.target}`;
  });

  const allDone = MISSIONS.every((m) => ((progress[m.key] as number) ?? 0) >= m.target);
  if (allDone && !progress.reward_claimed) lines.push('\n🎁 全達成！/weekly claim で巡礼者の週箱を受け取れます。');
  else if (progress.reward_claimed) lines.push('\n週次報酬受取済み。');
  return lines.join('\n');
}

export function claimWeeklyReward(userId: string): { success: boolean; message: string } {
  const progress = getWeeklyProgress(userId);
  if (progress.reward_claimed) return { success: false, message: '今週の報酬は既に受け取り済みです。' };

  const allDone = MISSIONS.every((m) => ((progress[m.key] as number) ?? 0) >= m.target);
  if (!allDone) return { success: false, message: 'まだ全ミッションを達成していません。' };

  addItem(userId, 'upg_fine_stone', 3);
  addItem(userId, 'src_star_mark', 1);
  addItem(userId, 'mat_starfall_shard', 2);

  const wk = weekKey();
  getDb().prepare('UPDATE weekly_progress SET reward_claimed = 1 WHERE user_id = ? AND week_key = ?').run(userId, wk);
  return { success: true, message: '巡礼者の週箱を受け取った！\n上質な強化石x3、星印の欠片x1、星落ちの破片x2' };
}
