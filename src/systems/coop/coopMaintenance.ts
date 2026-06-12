import { getDb } from '../../db/database';
import { expireStaleRecruits } from './coopRecruitSystem';
import {
  cleanupStaleCoopBattles,
  autoDefendMissingActions,
  tryResolveCoopTurn,
  getActiveCoopBattleIds,
} from './coopBattleSystem';
import { syncBattleChannelMessage, syncRecruitOnExpire } from './coopMessageSync';

const POLL_MS = 20_000;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let pollRunning = false;

/** Bot起動時に古いlock/期限切れ募集を安全処理 */
export function runCoopMaintenance(): { expiredRecruits: number; staleBattles: number } {
  const expiredRecruits = expireStaleRecruits();
  const staleBattles = cleanupStaleCoopBattles();
  return { expiredRecruits, staleBattles };
}

/** PM2再起動後も安全 — intervalは1つだけ */
export function startCoopPolling(): void {
  if (pollTimer) return;
  pollTimer = setInterval(() => {
    void runCoopPollTick();
  }, POLL_MS);
}

export function stopCoopPolling(): void {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
}

async function runCoopPollTick(): Promise<void> {
  if (pollRunning) return;
  pollRunning = true;
  try {
    const expired = expireStaleRecruits();
    if (expired > 0) {
      const rows = getDb().prepare(`
        SELECT id FROM coop_recruits WHERE status = 'expired' ORDER BY updated_at DESC LIMIT 20
      `).all() as Array<{ id: string }>;
      for (const r of rows) await syncRecruitOnExpire(r.id);
    }
    cleanupStaleCoopBattles();

    for (const battleId of getActiveCoopBattleIds()) {
      autoDefendMissingActions(battleId);
      const before = getDb().prepare('SELECT status, turn_count FROM coop_battle_sessions WHERE id = ?').get(battleId) as {
        status: string; turn_count: number;
      } | undefined;
      tryResolveCoopTurn(battleId);
      const after = getDb().prepare('SELECT status, turn_count FROM coop_battle_sessions WHERE id = ?').get(battleId) as {
        status: string; turn_count: number;
      } | undefined;
      if (after && (after.status !== before?.status || after.turn_count !== before?.turn_count)) {
        await syncBattleChannelMessage(battleId);
      }
    }
  } catch {
    /* ポーリング失敗でbot全体を止めない */
  } finally {
    pollRunning = false;
  }
}

export { runCoopPollTick as runCoopPollTickForTest };
