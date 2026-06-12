import { getDb } from '../db/database';
import { requirePlayer } from './playerSystem';
import { hasStoryFlag } from './storySystem';
import { getAwakeningCandidates } from './awakeningSystem';
import { getKaiUniqueCandidates, getKaiSrcCandidates } from './kaiForgeSystem';
import { MAX_AWAKENING_LEVEL } from '../db/seedData/awakeningMaster';

export type HintTrigger =
  | 'town_arrival' | 'explore_return' | 'level_up' | 'material_gain'
  | 'boss_defeat' | 'awakening_ready' | 'unique_ready' | 'src_ready' | 'boss_unlock';

const KAI_HINTS = {
  awakening: '「その武器、まだ奥で鳴っている。同じ形を重ねれば、少しは応えるかもしれん。」',
  unique: '「刃の奥まで覚醒したなら…見せてみろ。伝承の名が刻めるかもしれん。」',
  src: '「星巡の残響を手にしたなら、次は変質の段階だ。」',
};

export function getPassiveNpcHints(userId: string, trigger: HintTrigger): string[] {
  const hints: string[] = [];
  const player = requirePlayer(userId);

  if (trigger === 'explore_return' || trigger === 'town_arrival') {
    if (getAwakeningCandidates(userId).length > 0) {
      hints.push(`カイ: ${KAI_HINTS.awakening}`);
    }
    if (getKaiUniqueCandidates(userId).length > 0 && hasStoryFlag(userId, 'chapter_completed:ch2_silver')) {
      hints.push(`カイ: ${KAI_HINTS.unique}`);
    }
    if (getKaiSrcCandidates(userId).length > 0) {
      hints.push(`カイ: ${KAI_HINTS.src}`);
    }
  }

  if (trigger === 'level_up' && player.level === 20 && !player.sub_job) {
    hints.push('受付: 「Lv20を超えた旅人には、副たる職能を持てる。冒険者ギルドで相談を。」');
  }

  if (trigger === 'boss_defeat' && hasStoryFlag(userId, 'boss_defeated:boss_old_furnace_keeper')) {
    hints.push('カイ: 「深層炉の熱が落ち着いた。残響を集めれば、Srcへの道が開く。」');
  }

  if (trigger === 'town_arrival') {
    const town = player.current_town_id;
    const visits = getDb().prepare(`
      SELECT visit_count FROM player_town_visits WHERE user_id = ? AND town_id = ?
    `).get(userId, town) as { visit_count: number } | undefined;
    if (visits?.visit_count === 1 && town === 'mist_forest') {
      hints.push('案内人: 「霧の森では毒と呪いに注意。回復品を忘れずに。」');
    }
  }

  const maxAwakened = getDb().prepare(`
    SELECT COUNT(*) AS c FROM player_inventory pi
    JOIN equipment e ON pi.item_id = e.item_id
    WHERE pi.user_id = ? AND pi.awakening_level >= ?
  `).get(userId, MAX_AWAKENING_LEVEL) as { c: number };
  if (trigger === 'awakening_ready' && maxAwakened.c > 0) {
    hints.push(`カイ: ${KAI_HINTS.unique}`);
  }

  return [...new Set(hints)].slice(0, 2);
}

export function formatPassiveHints(hints: string[]): string {
  if (!hints.length) return '';
  return ['', '---', '町の便り', ...hints.map((h) => `💬 ${h}`)].join('\n');
}
