import { getDb } from '../db/database';
import { requirePlayer } from './playerSystem';
import { hasStoryFlag } from './storySystem';
import { getAwakeningCandidates } from './awakeningSystem';
import { canKaiSrc, getKaiUniqueCandidates, getKaiSrcCandidates } from './kaiForgeSystem';
import { SRC_FORGE_MATERIAL_ID } from '../db/seedData/awakeningMaster';
import { getItemCount } from './inventorySystem';
import { isFeatureUnlocked, townHasFacilityType, getRoadmapHints } from './progressionSystem';
import { getFacilitiesForTown } from './facilitySystem';
import { getCurrentTown } from './townSystem';

export type HintTrigger =
  | 'town_arrival' | 'explore_return' | 'level_up' | 'material_gain'
  | 'boss_defeat' | 'awakening_ready' | 'unique_ready' | 'src_ready' | 'boss_unlock';

type HintCandidate = { weight: number; line: string };

const KAI_HINTS = {
  awakening: 'カイ: 「その武器、まだ奥で鳴っている。同じ形を重ねれば、少しは応えるかもしれん。」',
  unique: 'カイ: 「刃の奥まで覚醒したなら…見せてみろ。伝承の名が刻めるかもしれん。」',
  src: 'カイ: 「星巡の残響を手にしたなら、次は変質の段階だ。」',
};

/** 町ごとの雑談・軽いヒント（進行度に関係なく出してよいもの） */
const TOWN_FLAVOR: Record<string, string[]> = {
  start_starfield: [
    '町の人: 「無理に遠くへ行かなくてもいい。まずは近くを歩いて、体を慣らすことだ。」',
    '町の人: 「傷が深いなら、戻るのも立派な判断だよ。」',
    'リナ: 「星原の宿なら、少し休めますよ。」',
  ],
  twilight_port: [
    'ユイ: 「顔色が悪いわ。無理をする前に、少し休んでいきなさい。」',
    '灯台守セリア: 「海風が強い日は、思ったより体力を削られるのよ。」',
    '船頭バルト: 「港の外へ出るなら、回復薬くらいは持っておけよ。」',
  ],
  silver_mine: [
    'グレン: 「坑道の敵は硬い。武器を少し鍛えるだけでも違うぞ。」',
    '町の坑夫: 「無理に奥へ行くな。帰れるうちに帰るのも大事だ。」',
    'オルガ: 「防具の傷は放っておくと、次の一撃で効いてくる。」',
  ],
  mist_forest: [
    '案内人: 「霧の森では毒と呪いに注意。回復品を忘れずに。」',
    'ノア: 「霧の宿で休んでから、森へ向かうと心強いよ。」',
  ],
  moon_library: [
    '司書エリス: 「記録端末室へ向かうなら、光を扱う術があると心強いでしょう。」',
    '古文書の証人: 「読めぬ記録ほど、こちらを見返してくるものだ。」',
    'シズク: 「疲れているなら、戻って休んだ方がいい。無理に読む本じゃない。」',
  ],
};

function pickWeighted(candidates: HintCandidate[], count: number): string[] {
  const pool = [...candidates];
  const out: string[] = [];
  while (pool.length && out.length < count) {
    const total = pool.reduce((s, c) => s + c.weight, 0);
    let roll = Math.random() * total;
    let idx = 0;
    for (let i = 0; i < pool.length; i++) {
      roll -= pool[i]!.weight;
      if (roll <= 0) { idx = i; break; }
    }
    out.push(pool[idx]!.line);
    pool.splice(idx, 1);
  }
  return out;
}

function countHealingPotions(userId: string): number {
  const rows = getDb().prepare(`
    SELECT pi.quantity FROM player_inventory pi
    JOIN items i ON pi.item_id = i.id
    WHERE pi.user_id = ? AND i.category = 'consumable'
      AND i.battle_effect_json LIKE '%heal_hp%'
  `).all(userId) as Array<{ quantity: number }>;
  return rows.reduce((s, r) => s + r.quantity, 0);
}

function hasDamagedEquipment(userId: string): boolean {
  const row = getDb().prepare(`
    SELECT COUNT(*) AS c FROM player_equipment pe
    JOIN player_inventory pi ON pi.id = pe.inventory_id
    WHERE pe.user_id = ? AND pi.durability_state != '良好'
  `).get(userId) as { c: number };
  return row.c > 0;
}

function restFacilityNames(townId: string): { inn?: string; shrine?: string } {
  const facs = getFacilitiesForTown(townId);
  return {
    inn: facs.find((f) => f.type === 'inn')?.name,
    shrine: facs.find((f) => f.type === 'shrine')?.name,
  };
}

function canShowKaiAwakeningHint(userId: string): boolean {
  if (!isFeatureUnlocked(userId, 'blacksmith')) return false;
  const townId = requirePlayer(userId).current_town_id;
  if (!townHasFacilityType(townId, ['blacksmith', 'repair_shop'])) return false;
  return getAwakeningCandidates(userId).length > 0;
}

function canShowKaiUniqueHint(userId: string): boolean {
  if (!hasStoryFlag(userId, 'chapter_completed:ch2_silver')) return false;
  const townId = requirePlayer(userId).current_town_id;
  if (!townHasFacilityType(townId, ['blacksmith'])) return false;
  return getKaiUniqueCandidates(userId).length > 0;
}

function canShowKaiSrcHint(userId: string): boolean {
  if (!hasStoryFlag(userId, 'boss_defeated:boss_old_furnace_keeper')) return false;
  if (getItemCount(userId, SRC_FORGE_MATERIAL_ID) < 1) return false;
  const townId = requirePlayer(userId).current_town_id;
  if (!townHasFacilityType(townId, ['blacksmith', 'src_forge'])) return false;
  const candidates = getKaiSrcCandidates(userId);
  return candidates.some((c) => canKaiSrc(userId, c.id).ok);
}

function collectStateHints(userId: string): HintCandidate[] {
  const player = requirePlayer(userId);
  const town = getCurrentTown(userId) as { id: string; name: string; required_level: number } | undefined;
  const townId = town?.id ?? player.current_town_id;
  const { inn, shrine } = restFacilityNames(townId);
  const hints: HintCandidate[] = [];

  const hpRatio = player.hp / Math.max(1, player.max_hp);
  const mpRatio = player.mp / Math.max(1, player.max_mp);
  if (hpRatio < 0.5 || mpRatio < 0.45) {
    if (shrine && townId === 'twilight_port') {
      hints.push({ weight: 4, line: 'ユイ: 「その傷、見過ごせないわ。先に救護所へ寄っていきなさい。」' });
    }
    if (inn && townId === 'twilight_port') {
      hints.push({ weight: 3, line: '灯台守セリア: 「顔色が悪いわね。海風の宿で休んでいく？」' });
    }
    if (shrine) hints.push({ weight: 3, line: `${shrine}で休めば、HP/MPが戻る。` });
    else if (inn) hints.push({ weight: 3, line: `${inn}で休めば、HP/MPが戻る。` });
  }

  const potions = countHealingPotions(userId);
  if (potions <= 2 && townHasFacilityType(townId, ['item_shop', 'market'])) {
    hints.push({ weight: 3, line: '回復薬が少ない。売店で補充しておくと安心だ。' });
  }

  if (hasDamagedEquipment(userId) && townHasFacilityType(townId, ['blacksmith', 'repair_shop'])) {
    hints.push({ weight: 3, line: '装備に傷がある。鍛冶場か修理屋で手入れを。' });
  }

  if (town && player.level < town.required_level - 2) {
    hints.push({ weight: 2, line: `${town.name}の探索は、もう少しLvを上げてからの方が安全だ。` });
  }

  return hints;
}

function collectProgressHints(userId: string): HintCandidate[] {
  const roadmap = getRoadmapHints(userId);
  const hints: HintCandidate[] = [];
  for (const line of roadmap.now.slice(0, 2)) {
    if (line.includes('Src') || line.includes('ヴァルハラ') || line.includes('レイド')) continue;
    hints.push({ weight: 2, line: `目安: ${line}` });
  }
  return hints;
}

export function getPassiveNpcHints(userId: string, trigger: HintTrigger): string[] {
  const player = requirePlayer(userId);
  const townId = player.current_town_id;
  const candidates: HintCandidate[] = [];

  if (trigger === 'town_arrival' || trigger === 'explore_return') {
    const flavor = TOWN_FLAVOR[townId] ?? [];
    for (const line of flavor) candidates.push({ weight: 3, line });
    candidates.push(...collectStateHints(userId));
    candidates.push(...collectProgressHints(userId));

    if (canShowKaiAwakeningHint(userId)) {
      candidates.push({ weight: 1, line: KAI_HINTS.awakening });
    }
    if (canShowKaiUniqueHint(userId)) {
      candidates.push({ weight: 1, line: KAI_HINTS.unique });
    }
    if (canShowKaiSrcHint(userId)) {
      candidates.push({ weight: 1, line: KAI_HINTS.src });
    }
  }

  if (trigger === 'level_up' && player.level === 20 && !player.sub_job) {
    candidates.push({ weight: 5, line: '受付: 「Lv20を超えた旅人には、副たる職能を持てる。冒険者ギルドで相談を。」' });
  }

  if (trigger === 'boss_defeat' && hasStoryFlag(userId, 'boss_defeated:boss_old_furnace_keeper')) {
    if (getItemCount(userId, SRC_FORGE_MATERIAL_ID) >= 1 && canShowKaiSrcHint(userId)) {
      candidates.push({ weight: 4, line: 'カイ: 「深層炉の熱が落ち着いた。残響を集めれば、Srcへの道が開く。」' });
    }
  }

  if (trigger === 'town_arrival') {
    const visits = getDb().prepare(`
      SELECT visit_count FROM player_town_visits WHERE user_id = ? AND town_id = ?
    `).get(userId, townId) as { visit_count: number } | undefined;
    if (visits?.visit_count === 1 && townId === 'mist_forest') {
      candidates.push({ weight: 4, line: '案内人: 「霧の森では毒と呪いに注意。回復品を忘れずに。」' });
    }
  }

  if (trigger === 'awakening_ready' && canShowKaiUniqueHint(userId)) {
    candidates.push({ weight: 3, line: KAI_HINTS.unique });
  }

  const picked = pickWeighted(candidates, 2);
  return [...new Set(picked)];
}

export function formatPassiveHints(hints: string[]): string {
  if (!hints.length) return '';
  return ['', '---', '町の便り', ...hints.map((h) => `💬 ${h}`)].join('\n');
}
