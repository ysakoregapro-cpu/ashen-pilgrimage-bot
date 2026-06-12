import { getDb } from '../db/database';
import { getDialogue, getNpc, buildNpcBody } from './npcConversationSystem';
import { requirePlayer, getPlayer, recalculatePlayerStats } from './playerSystem';
import { getEnhanceableEquipment } from './upgradeSystem';
import { getAwakeningCandidates } from './awakeningSystem';
import { getKaiUniqueCandidates, getKaiSrcCandidates } from './kaiForgeSystem';
import { formatRematchBossList, getRematchableBosses } from './bossRematchSystem';
import { getUniqueWeapons } from './srcWeaponSystem';
import { getJobs } from './jobSystem';
import { formatEquipmentDisplay } from './equipmentSystem';
import { buildInventorySummaryText } from '../utils/inventoryUi';
import { restAtInn, shrineHeal, formatRestPreview, isFullyRested } from './innSystem';
import { formatShopCatalogForPlayer, getShopCatalog, getSellableInventory } from './shopSystem';
import { getActiveListings, getMyListings, formatListingList } from './marketSystem';
import { formatCurrentEquipment } from './prepSystem';
import { getCurrentTown } from './townSystem';

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

/** 現在の町で type が一致する施設 id（post-action 戻り先用） */
export function findFacilityInTown(userId: string, facilityType: string): string | undefined {
  const town = getCurrentTown(userId) as { id: string } | undefined;
  if (!town) return undefined;
  const row = getDb().prepare(`
    SELECT id FROM facilities WHERE town_id = ? AND type = ? ORDER BY name LIMIT 1
  `).get(town.id, facilityType) as { id: string } | undefined;
  return row?.id;
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
      return [{ id: 'rest_preview', label: '休む' }, talk, explain, home];
    case 'blacksmith':
    case 'repair_shop': {
      const actions: FacAction[] = [
        { id: 'enhance', label: '武器を鍛える（+強化）' },
        { id: 'awaken', label: '真の力を引き出す（覚醒）' },
        { id: 'repair', label: '装備を修理する' },
        { id: 'dismantle', label: '装備を分解する' },
      ];
      if (facility.npc_id === 'npc_kai') {
        actions.splice(2, 0,
          { id: 'kai_unique', label: '伝承する（Uni化）' },
          { id: 'kai_src', label: 'Srcへ変質する' },
        );
      }
      return [...actions, talk, explain, home];
    }
    case 'guild_board':
      return [
        { id: 'boss_rematch', label: 'ボス再戦' },
        { id: 'job', label: '職能を選ぶ' },
        { id: 'profile', label: '旅人の記録を見る' },
        talk,
        { id: 'explain', label: '冒険の手ほどき' },
        home,
      ];
    case 'shrine':
      return [
        { id: 'heal_preview', label: '回復する' },
        talk,
        { id: 'explain', label: '救護について聞く' },
        home,
      ];
    case 'rescue_board':
      return [
        { id: 'rescue_info', label: '救難の便りを見る' },
        talk,
        { id: 'explain', label: '共闘について聞く' },
        home,
      ];
    case 'library':
      return [
        { id: 'codex', label: '図鑑を見る' },
        { id: 'boss_rematch', label: 'ボス再戦' },
        talk,
        { id: 'explain', label: '記録について聞く' },
        { id: 'hint', label: '古い噂を聞く' },
        home,
      ];
    case 'src_forge':
      return [
        { id: 'src_check', label: '古い武器を確かめる' },
        { id: 'src_manifest', label: '伝承の条件を聞く' },
        { id: 'src_upgrade', label: 'Src武器を鍛える' },
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
      return [
        { id: 'shop_browse', label: '品物を見る' },
        { id: 'shop_buy', label: '買う' },
        { id: 'shop_sell', label: '売る' },
        talk, explain, home,
      ];
    case 'exchange':
    case 'exchange_under':
    case 'exchange_fort':
      return [
        { id: 'market_browse', label: '出品一覧' },
        { id: 'market_sell', label: '出品する' },
        { id: 'market_my', label: '自分の出品' },
        talk, explain, home,
      ];
    case 'prep_room':
      return [
        { id: 'prep_equip', label: '装備を変える' },
        { id: 'prep_skills', label: 'スキルを見る' },
        { id: 'prep_inventory', label: '所持品を見る' },
        { id: 'prep_status', label: 'ステータスを見る' },
        home,
      ];
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
  type: 'text' | 'upgrade_select' | 'job_select' | 'travel' | 'profile' | 'inventory' | 'equip' | 'src_select' | 'rescue_hint' | 'raid_hint' | 'coop_recruit'
    | 'shop_browse' | 'shop_buy' | 'shop_sell' | 'market_browse' | 'market_sell' | 'market_my' | 'prep_equip' | 'prep_menu' | 'inn_preview' | 'boss_rematch_select';
  message: string;
  extra?: string;
} {
  const facility = getFacility(facilityId);
  if (!facility) return { type: 'text', message: 'その場所は見つかりません。' };

  const npcId = facility.npc_id;

  if (actionId === 'rest_preview' || actionId === 'rest') {
    if (isFullyRested(userId)) {
      return { type: 'text', message: '今は休まなくても大丈夫そうです。', extra: 'already_full' };
    }
    const town = getCurrentTown(userId) as { id: string } | undefined;
    return { type: 'inn_preview', message: formatRestPreview(userId, town?.id ?? 'start_starfield', '宿屋'), extra: 'inn' };
  }
  if (actionId === 'rest_confirm') {
    const town = getCurrentTown(userId) as { id: string } | undefined;
    const result = restAtInn(userId, town?.id ?? 'start_starfield');
    return { type: 'text', message: result.message, extra: result.ok ? 'rest_ok' : result.reason ?? 'rest_fail' };
  }

  if (actionId === 'heal_preview' || actionId === 'heal') {
    if (isFullyRested(userId)) {
      return { type: 'text', message: '今は休まなくても大丈夫そうです。', extra: 'already_full' };
    }
    const town = getCurrentTown(userId) as { id: string } | undefined;
    return { type: 'inn_preview', message: formatRestPreview(userId, town?.id ?? 'start_starfield', '救護所'), extra: 'shrine' };
  }
  if (actionId === 'heal_confirm') {
    const town = getCurrentTown(userId) as { id: string } | undefined;
    const result = shrineHeal(userId, town?.id ?? 'start_starfield');
    return { type: 'text', message: result.message, extra: result.ok ? 'rest_ok' : result.reason ?? 'rest_fail' };
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

  if (actionId === 'enhance') {
    return { type: 'upgrade_select', message: '強化石とゴールドで、武器の+値を上げます。\nどの装備を鍛えますか？', extra: 'enhance' };
  }
  if (actionId === 'awaken') {
    const candidates = getAwakeningCandidates(userId);
    if (!candidates.length) {
      return { type: 'text', message: '真の力を引き出す（覚醒）\n\n同じ武器を重ねて、武器の眠った力を引き出します。\n\n条件を満たす武器がまだありません。N/R/SR/URの未覚醒最大武器と同名武器が必要です。' };
    }
    return { type: 'upgrade_select', message: '同じ武器を重ねて、武器の眠った力を引き出します。\nどの武器を覚醒しますか？', extra: 'awaken' };
  }
  if (actionId === 'kai_unique') {
    const candidates = getKaiUniqueCandidates(userId);
    if (!candidates.length) {
      return { type: 'text', message: '伝承する（Uni化）\n\n最大覚醒した職業初期武器と再戦素材で、カイがUni武器へ刻印します。\n\n条件を満たす武器がありません。' };
    }
    return { type: 'upgrade_select', message: '最大覚醒した職業初期武器を、カイがUni武器へ伝承します。', extra: 'kai_unique' };
  }
  if (actionId === 'kai_src') {
    const candidates = getKaiSrcCandidates(userId);
    if (!candidates.length) {
      return { type: 'text', message: 'Srcへ変質する\n\nUni武器と星巡の残響を使い、Src武器へ変質させます。\n\n対象のUni武器または素材が不足しています。' };
    }
    return { type: 'upgrade_select', message: 'Uni武器と星巡の残響を使い、Src武器へ変質させます。', extra: 'kai_src' };
  }
  if (actionId === 'boss_rematch') {
    const bosses = getRematchableBosses(userId);
    if (!bosses.length) {
      return { type: 'text', message: formatRematchBossList(userId) };
    }
    return {
      type: 'boss_rematch_select',
      message: formatRematchBossList(userId),
      extra: facilityId,
    };
  }
  if (actionId === 'repair') return { type: 'upgrade_select', message: 'どの装備を修理しますか？', extra: 'repair' };
  if (actionId === 'dismantle') return { type: 'upgrade_select', message: 'どの装備を分解しますか？', extra: 'dismantle' };
  if (actionId === 'job') return { type: 'job_select', message: 'どの職能を選びますか？' };
  if (actionId === 'profile') return { type: 'profile', message: '' };
  if (actionId === 'shop_browse' || actionId === 'shop') {
    const town = getCurrentTown(userId) as { id: string } | undefined;
    return { type: 'shop_browse', message: formatShopCatalogForPlayer(userId, town?.id ?? 'start_starfield') };
  }
  if (actionId === 'shop_buy') return { type: 'shop_buy', message: '何を買いますか？', extra: facilityId };
  if (actionId === 'shop_sell') return { type: 'shop_sell', message: '何を売りますか？', extra: facilityId };
  if (actionId === 'market_browse') {
    const listings = getActiveListings(15) as Array<{ id: string; name: string; rarity: string; price: number; upgrade_level: number; seller_id: string }>;
    return { type: 'market_browse', message: formatListingList(listings) };
  }
  if (actionId === 'market_sell') return { type: 'market_sell', message: '何を出品しますか？', extra: facilityId };
  if (actionId === 'market_my') return { type: 'market_my', message: '自分の出品', extra: facilityId };
  if (actionId === 'prep_equip') return { type: 'prep_equip', message: 'どの部位を変更しますか？', extra: facilityId };
  if (actionId === 'prep_skills') return { type: 'text', message: 'スキルは /skills または戦闘中の「技」から確認できます。' };
  if (actionId === 'prep_inventory') return { type: 'inventory', message: '' };
  if (actionId === 'prep_status') return { type: 'profile', message: '' };
  if (actionId === 'equip') return { type: 'prep_menu', message: formatCurrentEquipment(userId), extra: facilityId };
  if (actionId === 'travel') return { type: 'travel', message: '' };
  if (actionId === 'src_check' || actionId === 'src_manifest') return { type: 'src_select', message: 'どの古い武器を確かめますか？', extra: actionId };
  if (actionId === 'src_upgrade') {
    const items = getUpgradeSelectOptions(userId, 'src');
    if (!items.length) {
      return { type: 'text', message: 'Src武器を鍛える\n\nヴァルハラで得た素材を使い、Src武器を+10まで鍛えます。\n\n鍛えられるSrc武器がありません。' };
    }
    return { type: 'upgrade_select', message: 'ヴァルハラで得た素材を使い、Src武器を+10まで鍛えます。', extra: 'src' };
  }
  if (actionId === 'rescue_pre') {
    return { type: 'coop_recruit', message: '事前救難募集を掲示板へ出します。', extra: 'rescue:preemptive' };
  }
  if (actionId === 'rescue_info') {
    return { type: 'coop_recruit', message: '救難要請を掲示板へ出します。', extra: 'rescue:explore' };
  }
  if (actionId === 'raid_recruit') {
    return { type: 'coop_recruit', message: 'ヴァルハラレイド募集を掲示板へ出します。', extra: 'raid' };
  }
  if (actionId === 'raid_info') {
    return { type: 'raid_hint', message: '空中要塞ヴァルハラへの共闘探索は、端末から募集できます。\n最大四人。人数が増えれば、防衛も厚くなる。' };
  }
  if (actionId === 'codex') {
    return { type: 'text', message: '古い記録には、まだ読めない頁が多い。\n探索を重ねれば、図鑑の空白も少しずつ埋まっていくだろう。' };
  }

  return { type: 'text', message: '……今日は、ここまでにしておこう。' };
}

export function getUpgradeSelectOptions(userId: string, mode: string) {
  if (mode === 'awaken') {
    return getAwakeningCandidates(userId).map((i) => ({
      id: i.id, name: i.name, rarity: i.rarity, src_level: 0,
    }));
  }
  if (mode === 'kai_unique') {
    return getKaiUniqueCandidates(userId).map((i) => ({ id: i.id, name: i.name, rarity: 'N', src_level: 0 }));
  }
  if (mode === 'kai_src') {
    return getKaiSrcCandidates(userId).map((i) => ({ id: i.id, name: i.name, rarity: 'SR', src_level: 0 }));
  }
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
  return buildInventorySummaryText(userId);
}

export function formatEquipSummary(userId: string): string {
  return formatEquipmentDisplay(userId);
}
