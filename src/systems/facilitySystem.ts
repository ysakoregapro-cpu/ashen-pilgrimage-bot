import { getDb } from '../db/database';
import { getDialogue, getNpc, buildNpcBody } from './npcConversationSystem';
import { healPlayer, requirePlayer, getPlayer, recalculatePlayerStats } from './playerSystem';
import { getEnhanceableEquipment } from './upgradeSystem';
import { getUniqueWeapons } from './srcWeaponSystem';
import { getJobs } from './jobSystem';
import { formatEquipmentDisplay } from './equipmentSystem';
import { getInventoryByCategory } from './inventorySystem';

export interface FacilityRow {
  id: string;
  town_id: string;
  name: string;
  type: string;
  npc_id: string | null;
  description: string;
  action_type: string;
  unlock_condition_text: string | null;
}

export function getFacility(facilityId: string): FacilityRow | undefined {
  return getDb().prepare('SELECT * FROM facilities WHERE id = ?').get(facilityId) as FacilityRow | undefined;
}

export function getFacilitiesForTown(townId: string): FacilityRow[] {
  return getDb().prepare('SELECT * FROM facilities WHERE town_id = ? ORDER BY name').all(townId) as FacilityRow[];
}

export function getFacilityHostName(facility: FacilityRow): string {
  if (!facility.npc_id) return '待ち人';
  const npc = getNpc(facility.npc_id);
  return npc?.name ?? '待ち人';
}

export function buildFacilityGreeting(facility: FacilityRow, isFirst: boolean): string {
  if (facility.npc_id) {
    const npc = getNpc(facility.npc_id);
    if (npc) {
      const speech = getDialogue(facility.npc_id, 'greeting', isFirst);
      return buildNpcBody(npc, speech);
    }
  }
  return `**${facility.name}**\n${facility.description}\n\n今日はどうする？`;
}

type FacAction = { id: string; label: string };

export function getFacilityActions(facility: FacilityRow): FacAction[] {
  const home: FacAction = { id: 'home', label: '町へ戻る' };
  const talk: FacAction = { id: 'smalltalk', label: '少し話す' };
  const explain: FacAction = { id: 'explain', label: getExplainLabel(facility.type) };

  switch (facility.type) {
    case 'inn':
      return [{ id: 'rest', label: '休む' }, talk, explain, home];
    case 'blacksmith':
    case 'repair_shop':
      return [
        { id: 'enhance', label: '装備を強化する' },
        { id: 'repair', label: '装備を修理する' },
        { id: 'dismantle', label: '装備を分解する' },
        talk,
        explain,
        home,
      ];
    case 'guild_board':
      return [
        { id: 'job', label: '職能を選ぶ' },
        { id: 'profile', label: '旅人の記録を見る' },
        talk,
        { id: 'explain', label: '冒険の手ほどき' },
        home,
      ];
    case 'shrine':
      return [
        { id: 'heal', label: '回復する' },
        talk,
        { id: 'explain', label: '救護について聞く' },
        { id: 'rescue_pre', label: '事前救難を出す' },
        home,
      ];
    case 'rescue_board':
      return [
        { id: 'rescue_info', label: '救難の便りを見る' },
        { id: 'rescue_pre', label: '事前救難を出す' },
        { id: 'raid_info', label: '共闘探索の募集' },
        talk,
        { id: 'explain', label: '共闘について聞く' },
        home,
      ];
    case 'library':
      return [
        { id: 'codex', label: '図鑑を見る' },
        talk,
        { id: 'explain', label: '記録について聞く' },
        { id: 'hint', label: '古い噂を聞く' },
        home,
      ];
    case 'src_forge':
      return [
        { id: 'src_check', label: '古い武器を確かめる' },
        { id: 'src_manifest', label: '伝承の条件を聞く' },
        { id: 'src_upgrade', label: '伝承武器を鍛える' },
        talk,
        home,
      ];
    case 'raid_terminal':
      return [
        { id: 'raid_recruit', label: '要塞探索を募集する' },
        talk,
        { id: 'explain', label: '端末の説明を聞く' },
        home,
      ];
    case 'item_shop':
    case 'market':
      return [talk, explain, { id: 'shop', label: '品物を見る' }, home];
    case 'training_ground':
      return [talk, explain, { id: 'profile', label: '旅人の記録を見る' }, home];
    case 'travel_gate':
      return [{ id: 'travel', label: '別の町へ向かう' }, talk, explain, home];
    default:
      return [talk, explain, home];
  }
  return [talk, explain, home];
}

function getExplainLabel(type: string): string {
  const labels: Record<string, string> = {
    inn: 'この宿について聞く',
    blacksmith: '鍛冶の話を聞く',
    repair_shop: '修理の話を聞く',
    guild_board: '受付の説明を聞く',
    library: '図書館について聞く',
    shrine: '救護について聞く',
    src_forge: '伝承の炉について',
    raid_terminal: '端末について聞く',
    item_shop: '店について聞く',
    market: '市について聞く',
    training_ground: '訓練場について',
    travel_gate: '道について聞く',
  };
  return labels[type] ?? 'ここについて聞く';
}

export function executeFacilityAction(userId: string, facilityId: string, actionId: string): {
  type: 'text' | 'upgrade_select' | 'job_select' | 'travel' | 'profile' | 'inventory' | 'equip' | 'src_select' | 'rescue_hint' | 'raid_hint';
  message: string;
  extra?: string;
} {
  const facility = getFacility(facilityId);
  if (!facility) return { type: 'text', message: 'その場所は見つかりません。' };

  const npcId = facility.npc_id;

  if (actionId === 'rest' || actionId === 'heal') {
    healPlayer(userId, 1);
    recalculatePlayerStats(userId);
    const cost = actionId === 'rest' ? 10 : 0;
    if (cost > 0) {
      const p = requirePlayer(userId);
      if (p.gold >= cost) {
        getDb().prepare('UPDATE players SET gold = gold - ? WHERE user_id = ?').run(cost, userId);
      }
    }
    return { type: 'text', message: actionId === 'rest'
      ? '深く息を吐くと、体の芯まで温かさが戻ってきた。\nHPとMPが全回復した。'
      : '灯火のような温もりが、傷を静かに閉じていく。\nHPとMPが全回復した。' };
  }

  if (actionId === 'smalltalk' && npcId) {
    const npc = getNpc(npcId);
    if (npc) return { type: 'text', message: buildNpcBody(npc, getDialogue(npcId, 'smalltalk')) };
  }
  if (actionId === 'explain' && npcId) {
    const npc = getNpc(npcId);
    if (npc) return { type: 'text', message: buildNpcBody(npc, getDialogue(npcId, 'explain')) };
  }
  if (actionId === 'hint' && npcId) {
    const npc = getNpc(npcId);
    if (npc) return { type: 'text', message: buildNpcBody(npc, getDialogue(npcId, 'hint')) };
  }

  if (actionId === 'enhance') return { type: 'upgrade_select', message: 'どの装備を鍛えますか？', extra: 'enhance' };
  if (actionId === 'repair') return { type: 'upgrade_select', message: 'どの装備を修理しますか？', extra: 'repair' };
  if (actionId === 'dismantle') return { type: 'upgrade_select', message: 'どの装備を分解しますか？', extra: 'dismantle' };
  if (actionId === 'job') return { type: 'job_select', message: 'どの職能を選びますか？' };
  if (actionId === 'profile') return { type: 'profile', message: '' };
  if (actionId === 'inventory' || actionId === 'shop') return { type: 'inventory', message: '' };
  if (actionId === 'equip') return { type: 'equip', message: '' };
  if (actionId === 'travel') return { type: 'travel', message: '' };
  if (actionId === 'src_check' || actionId === 'src_manifest') return { type: 'src_select', message: 'どの古い武器を確かめますか？', extra: actionId };
  if (actionId === 'src_upgrade') return { type: 'upgrade_select', message: 'どの伝承武器を鍛えますか？', extra: 'src' };
  if (actionId === 'rescue_pre' || actionId === 'rescue_info') {
    return { type: 'rescue_hint', message: '救難の便りは、救難掲示の場所へ届く。\n探索中に困ったら「救難を求める」から便りを出せ。\n高難度の探索前には、ここから事前救難を出すのも手だ。' };
  }
  if (actionId === 'raid_recruit' || actionId === 'raid_info') {
    return { type: 'raid_hint', message: '空中要塞ヴァルハラへの共闘探索は、掲示板から募集できる。\n最大四人。人数が増えれば、防衛も厚くなる。' };
  }
  if (actionId === 'codex') {
    return { type: 'text', message: '古い記録には、まだ読めない頁が多い。\n探索を重ねれば、図鑑の空白も少しずつ埋まっていくだろう。' };
  }

  return { type: 'text', message: '……今日は、ここまでにしておこう。' };
}

export function getUpgradeSelectOptions(userId: string, mode: string) {
  const items = getEnhanceableEquipment(userId) as Array<{ id: number; name: string; rarity: string; src_level: number }>;
  const filtered = mode === 'src'
    ? items.filter((i) => i.rarity === 'Src' || i.src_level > 0)
    : items;
  return filtered;
}

export function getSrcUniqueOptions(userId: string) {
  return getUniqueWeapons(userId) as Array<{ id: number; name: string }>;
}

export function getJobSelectOptions(userId: string) {
  const player = getPlayer(userId);
  if (!player) return [];
  if (player.main_job === '未選択') {
    return (getJobs('basic') as Array<{ name: string }>).map((j) => j.name);
  }
  return (getJobs('advanced') as Array<{ name: string }>).map((j) => j.name);
}

export function formatInventorySummary(userId: string): string {
  const items = getInventoryByCategory(userId, 'all') as Array<{ name: string; quantity: number; rarity: string }>;
  if (!items.length) return '所持品はまだない。';
  return items.slice(0, 15).map((i) => `${i.name} x${i.quantity}`).join('\n');
}

export function formatEquipSummary(userId: string): string {
  return formatEquipmentDisplay(userId);
}
