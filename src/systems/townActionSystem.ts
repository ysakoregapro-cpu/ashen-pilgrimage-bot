import { getPlayer, getUnlockedTowns } from './playerSystem';
import {
  getCurrentTown, getAllTowns, travelToTown, getVisitCount, recordTownVisit, returnToTownHub,
} from './townSystem';
import { getPassiveNpcHints, formatPassiveHints } from './npcHintSystem';
import { getFacilitiesForTown, buildFacilityGreeting, getFacility, getFacilityActions } from './facilitySystem';
import { getTownNpcs, getDialogue, getNpcGreeting, getNpc } from './npcConversationSystem';
import { getAreasForTown } from './explorationSystem';
import { buildExploreAreaOptions, formatAreaDetail } from './areaDisplaySystem';
import { buildGuideSection } from './dialogueSystem';
import { getRoadmapHints } from './progressionSystem';
import {
  townHubButtons,
  townHubEmbed,
  exploreSelectMenu,
  travelSelectMenu,
  facilitySelectMenu,
  npcSelectMenu,
  facilityActionButtons,
  npcTalkButtons,
  guideSectionButtons,
  type UiPayload,
} from '../utils/townUi';
import { nextActionButtons } from '../utils/nextActionButtons';
import { appendSelectNavigation } from '../utils/navigationComponents';
import { formatTownIntro, formatExploreResult, formatVictoryMessage, formatSpeech, formatSpeechOnly } from '../utils/formatters';
import { townMenuEmbed } from '../utils/embeds';
import {
  triggerTownFirstArrival,
  getPostBossTownDescription,
  getNpcDialogueForPlayer,
  advanceNpcDialogue,
  getPilgrimageJournal,
} from './storySystem';

const TOWN_GUIDE_NPC: Record<string, string> = {
  start_starfield: 'npc_aoi',
  twilight_port: 'npc_yui',
  silver_mine: 'npc_kai',
  mist_forest: 'npc_ren',
  moon_library: 'npc_shizuku',
  forgotten_market: 'npc_jin',
  hourglass_city: 'npc_krat',
  ash_capital: 'npc_capital_witness',
  deep_furnace_outpost: 'npc_furnace_witness',
  valhalla_fortress: 'npc_valhalla_guard',
  old_road_village: 'npc_rina',
  starfall_observatory: 'npc_stargazer',
};

export function travelToTownWithResult(userId: string, townId: string): { ok: boolean; message: string; isFirstVisit: boolean } {
  const before = getVisitCount(userId, townId);
  const message = travelToTown(userId, townId);
  const ok = message.endsWith('に着いた。');
  return { ok, message, isFirstVisit: ok && before === 0 };
}

export function buildTownHub(userId: string, opts?: { intro?: string; isFirstVisit?: boolean; skipLootConfirm?: boolean }): UiPayload {
  if (!opts?.skipLootConfirm) {
    const lootMsg = returnToTownHub(userId);
    if (lootMsg && opts?.intro) opts.intro = `${opts.intro}\n\n${lootMsg}`;
    else if (lootMsg && !opts?.intro) opts = { ...opts, intro: lootMsg };
  }
  const town = getCurrentTown(userId) as {
    id: string; name: string; description: string; required_level: number;
  } | undefined;
  if (!town) {
    return { embeds: [townHubEmbed('不明', '現在地が定まっていない。')], components: [] };
  }

  const facilities = getFacilitiesForTown(town.id);
  const npcs = getTownNpcs(town.id);
  let visitCount = getVisitCount(userId, town.id);
  const isFirst = opts?.isFirstVisit ?? (visitCount === 0);
  if (visitCount === 0) {
    recordTownVisit(userId, town.id);
    visitCount = 1;
  }

  let intro = opts?.intro ?? '';
  if (isFirst && !intro) {
    intro = buildFirstVisitIntro(userId, town.id, town.name);
  } else if (!intro) {
    const mood = getPostBossTownDescription(userId, town.id, town.description);
    intro = `${town.name}の風が、静かに頬を撫でる。\n${mood}\n今日はどうする？`;
  }

  const facNames = facilities.slice(0, 8).map((f) => f.name);
  const npcNames = npcs.slice(0, 6).map((n) => n.name);

  if (!opts?.intro?.includes('町の便り')) {
    intro += formatPassiveHints(getPassiveNpcHints(userId, 'town_arrival'));
  }

  const embed = townMenuEmbed(town.name, formatTownIntro(intro || town.description), [
    { label: 'この町でできること', items: ['町を歩く', '町の人と話す', '探索へ向かう', '別の町へ向かう'] },
    { label: '訪ねられる場所', items: facNames.length ? facNames : ['—'] },
    { label: '声をかけられそうな人', items: npcNames.length ? npcNames : ['—'] },
    { label: 'いまのおすすめ', items: suggestActionList(town.id, userId) },
  ]);

  return { embeds: [embed], components: townHubButtons() };
}

function suggestActionList(townId: string, userId: string): string[] {
  return getRoadmapHints(userId).now.slice(0, 4);
}

function buildFirstVisitIntro(userId: string, townId: string, townName: string): string {
  const guideId = TOWN_GUIDE_NPC[townId];
  if (guideId) {
    const npc = getNpc(guideId);
    if (npc) {
      const speech = getNpcGreeting(guideId, true);
      return `**${townName}** — 初めての訪れ。\n\n${formatSpeech(npc.name, speech)}\n\n*町を歩き、人と話し、探索へ向かえる。*`;
    }
  }
  return `**${townName}** — 初めての訪れ。\n灰と星屑の道が、ここまで続いていた。\n今日はどうする？`;
}

export function buildFacilityList(userId: string): UiPayload {
  const town = getCurrentTown(userId) as { id: string; name: string } | undefined;
  if (!town) return buildTownHub(userId);
  const facilities = getFacilitiesForTown(town.id);
  return {
    embeds: [townHubEmbed('町を歩く', `${town.name}で訪ねられる場所。`)],
    components: [facilitySelectMenu(facilities)],
  };
}

export function buildNpcList(userId: string): UiPayload {
  const town = getCurrentTown(userId) as { id: string; name: string } | undefined;
  if (!town) return buildTownHub(userId);
  const npcs = getTownNpcs(town.id);
  return {
    embeds: [townHubEmbed('町で出会える人', 'この町で声をかけられそうな人たち。')],
    components: [npcSelectMenu(npcs)],
  };
}

export function buildExploreList(userId: string): UiPayload {
  const town = getCurrentTown(userId) as { id: string; name: string } | undefined;
  if (!town) return buildTownHub(userId);
  const areas = getAreasForTown(town.id) as Array<{ id: string; name: string; recommended_min_level: number; recommended_max_level: number }>;
  return {
    embeds: [townHubEmbed('探索へ向かう', `${town.name}の周辺。どこへ足を踏み入れる？\n\n*エリアを選ぶと詳細が表示されます*`)],
    components: appendSelectNavigation([exploreSelectMenu(userId, areas)], 'explore', 'list'),
  };
}

export function buildAreaDetailView(userId: string, areaId: string): UiPayload {
  const detail = formatAreaDetail(userId, areaId);
  return {
    embeds: [townHubEmbed('探索先', detail)],
    components: nextActionButtons('explore_area', { areaId }),
  };
}

export function buildTravelList(userId: string): UiPayload {
  const unlocked = getUnlockedTowns(userId);
  const towns = getAllTowns() as Array<{ id: string; name: string; required_level: number }>;
  const options = towns.filter((t) => unlocked.includes(t.id));
  return {
    embeds: [townHubEmbed('別の町へ向かう', 'どこへ向かう？')],
    components: appendSelectNavigation([travelSelectMenu(options)], 'travel'),
  };
}

export function buildFacilityView(userId: string, facilityId: string): UiPayload {
  const facility = getFacility(facilityId);
  if (!facility) {
    return { embeds: [townHubEmbed('—', 'その場所は見当たらない。')], components: townHubButtons() };
  }
  const visitCount = getVisitCount(userId, facility.town_id);
  const body = buildFacilityGreeting(facility, visitCount <= 1);
  const actions = getFacilityActions(facility);
  return {
    embeds: [townHubEmbed(facility.name, body)],
    components: facilityActionButtons(facilityId, actions),
  };
}

export function buildNpcView(userId: string, npcId: string): UiPayload {
  const npc = getNpc(npcId);
  if (!npc) {
    return { embeds: [townHubEmbed('—', 'その人は見当たらない。')], components: townHubButtons() };
  }
  const speech = getNpcGreeting(npcId, getVisitCount(userId, npc.town_id) <= 1);
  return {
    embeds: [townHubEmbed(npc.name, formatSpeechOnly(speech))],
    components: npcTalkButtons(npcId),
  };
}

export function buildNpcDialogue(userId: string, npcId: string, type: 'smalltalk' | 'explain' | 'hint' | 'request'): UiPayload {
  const npc = getNpc(npcId);
  if (!npc) return buildTownHub(userId);

  if (type === 'smalltalk') {
    const storyLine = getNpcDialogueForPlayer(userId, npcId);
    if (storyLine) {
      advanceNpcDialogue(userId, npcId);
      return {
        embeds: [townHubEmbed(storyLine.title, storyLine.body)],
        components: nextActionButtons('npc_talk', { npcId }),
      };
    }
  }

  const dtype = type === 'request' ? 'explain' : type;
  const speech = getDialogue(npcId, dtype);
  return {
    embeds: [townHubEmbed(npc.name, formatSpeechOnly(speech))],
    components: nextActionButtons('npc_talk', { npcId }),
  };
}

export function buildGuideHome(userId: string): UiPayload {
  const journal = getPilgrimageJournal(userId);
  return {
    embeds: journal.embeds,
    components: [...journal.components, guideSectionButtons()],
  };
}

export function buildGuideView(section: string): UiPayload {
  const content = buildGuideSection(section);
  return {
    embeds: [townHubEmbed('巡礼手帳', content)],
    components: [...nextActionButtons('guide'), guideSectionButtons()],
  };
}

export function buildPostExplore(message: string, areaId?: string | null): UiPayload {
  return {
    embeds: [townHubEmbed('道中の記録', formatExploreResult(message))],
    components: nextActionButtons('explore_result', areaId ? { areaId } : undefined),
  };
}

export function buildPostVictory(
  message: string,
  opts?: { areaId?: string | null; isRematch?: boolean; monsterId?: string; rematchFacilityId?: string },
): UiPayload {
  const components = opts?.isRematch && opts.monsterId
    ? nextActionButtons('boss_rematch_done', { facilityId: opts.rematchFacilityId, monsterId: opts.monsterId })
    : nextActionButtons('victory', opts?.areaId ? { areaId: opts.areaId } : undefined);
  return {
    embeds: [townHubEmbed('戦いの記録', formatVictoryMessage(message)).setColor(0x44aa66)],
    components,
  };
}

export function buildPostDefeat(message: string): UiPayload {
  return {
    embeds: [townHubEmbed('帰還', message).setColor(0x666677)],
    components: nextActionButtons('defeat'),
  };
}

export function buildPostFled(message: string, areaId?: string | null): UiPayload {
  return {
    embeds: [townHubEmbed('道中の記録', `🧭 ${message}`)],
    components: nextActionButtons('explore_result', areaId ? { areaId } : undefined),
  };
}

export function buildSkillLearnedPost(jobName: string, skillNames: string[]): UiPayload {
  const body = [
    `*${jobName}としての歩みが、少し深まった。*`,
    '',
    '**新たな技を覚えた。**',
    ...skillNames.map((n) => `・${n}`),
  ].join('\n');
  return {
    embeds: [townHubEmbed('技を覚えた', body).setColor(0xc9b458)],
    components: nextActionButtons('victory'),
  };
}

export function buildPostFacility(message: string, facilityId: string): UiPayload {
  const facility = getFacility(facilityId);
  const actions = facility ? getFacilityActions(facility) : [];
  return {
    embeds: [townHubEmbed(facility?.name ?? '—', message)],
    components: facility ? facilityActionButtons(facilityId, actions) : townHubButtons(),
  };
}

export function arriveAndShowHub(userId: string, townId: string): UiPayload {
  const result = travelToTownWithResult(userId, townId);
  if (!result.ok) {
    return { embeds: [townHubEmbed('道', result.message)], components: townHubButtons() };
  }
  return buildTownHub(userId, { isFirstVisit: result.isFirstVisit, intro: `${result.message}\n` });
}

export function getTownArrivalStoryEvents(userId: string, townId: string) {
  return triggerTownFirstArrival(userId, townId);
}
