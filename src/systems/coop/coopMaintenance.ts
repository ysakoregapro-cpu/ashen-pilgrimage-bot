import { expireStaleRecruits } from './coopRecruitSystem';
import { cleanupStaleCoopBattles } from './coopBattleSystem';

/** Bot起動時に古いlock/期限切れ募集を安全処理 */
export function runCoopMaintenance(): { expiredRecruits: number; staleBattles: number } {
  const expiredRecruits = expireStaleRecruits();
  const staleBattles = cleanupStaleCoopBattles();
  return { expiredRecruits, staleBattles };
}
