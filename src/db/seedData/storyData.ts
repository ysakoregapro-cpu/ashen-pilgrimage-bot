/** ストーリーボス: story boss key → 討伐判定に使う monster_id */
export const STORY_BOSS_MONSTERS: Record<string, string> = {
  boss_starfield_anomaly: 'mon_night_shadow',
  boss_lamp_eater: 'mon_lighthouse_jelly',
  boss_furnace_remains: 'mon_silver_golem',
  boss_lost_guardian: 'mon_tree_guardian',
  boss_page_shadow: 'mon_silent_guardian',
  boss_forget_seller: 'mon_black_iron_exec',
  boss_unwinding_shadow: 'mon_throne_shadow',
  boss_old_furnace_keeper: 'mon_furnace_keeper',
  boss_old_king_echo: 'mon_old_king_shadow',
};

/** monster_id → story boss key */
export const MONSTER_TO_STORY_BOSS: Record<string, string> = Object.fromEntries(
  Object.entries(STORY_BOSS_MONSTERS).map(([k, v]) => [v, k]),
);

/** boss defeat → chapter complete + town unlock */
export const BOSS_CHAPTER_REWARDS: Record<string, { chapterFlag: string; unlockTown?: string; starShard?: number }> = {
  boss_starfield_anomaly: { chapterFlag: 'chapter_completed:prologue', unlockTown: 'twilight_port', starShard: 1 },
  boss_lamp_eater: { chapterFlag: 'chapter_completed:ch1_twilight', unlockTown: 'silver_mine', starShard: 2 },
  boss_furnace_remains: { chapterFlag: 'chapter_completed:ch2_silver', unlockTown: 'mist_forest', starShard: 3 },
  boss_lost_guardian: { chapterFlag: 'chapter_completed:ch3_mist', unlockTown: 'moon_library', starShard: 4 },
  boss_page_shadow: { chapterFlag: 'chapter_completed:ch4_library', unlockTown: 'forgotten_market', starShard: 5 },
  boss_forget_seller: { chapterFlag: 'chapter_completed:ch5_market', unlockTown: 'hourglass_city', starShard: 6 },
  boss_unwinding_shadow: { chapterFlag: 'chapter_completed:ch6_hourglass', unlockTown: 'deep_furnace_outpost', starShard: 7 },
  boss_old_furnace_keeper: { chapterFlag: 'chapter_completed:ch7_furnace', unlockTown: 'valhalla_fortress', starShard: 8 },
  boss_old_king_echo: { chapterFlag: 'chapter_completed:ch8_valhalla', starShard: 0 },
};

export const CHAPTERS = [
  { id: 'prologue', no: 0, title: '序章: 灰の下の星', summary: '巡礼の始まり。星原で異変を確かめる。', startTown: 'start_starfield', reqFlag: '', completeFlag: 'chapter_completed:prologue', reward: '星印の欠片・薄明への道', sort: 0 },
  { id: 'ch1_twilight', no: 1, title: '第一章: 薄明の灯', summary: '灯火と救難。港町の異変。', startTown: 'twilight_port', reqFlag: 'chapter_completed:prologue', completeFlag: 'chapter_completed:ch1_twilight', reward: '星印の欠片・白銀への道', sort: 1 },
  { id: 'ch2_silver', no: 2, title: '第二章: 白銀の炉', summary: '折れた武器を打ち直す。', startTown: 'silver_mine', reqFlag: 'chapter_completed:ch1_twilight', completeFlag: 'chapter_completed:ch2_silver', reward: '星印の欠片・霧の森への道', sort: 2 },
  { id: 'ch3_mist', no: 3, title: '第三章: 霧の守り人', summary: '守れなかった名を忘れない。', startTown: 'mist_forest', reqFlag: 'chapter_completed:ch2_silver', completeFlag: 'chapter_completed:ch3_mist', reward: '星印の欠片・図書館への道', sort: 3 },
  { id: 'ch4_library', no: 4, title: '第四章: 月下の記録', summary: '消された頁を探す。', startTown: 'moon_library', reqFlag: 'chapter_completed:ch3_mist', completeFlag: 'chapter_completed:ch4_library', reward: '星印の欠片・地下市への道', sort: 4 },
  { id: 'ch5_market', no: 5, title: '第五章: 忘却の取引', summary: '代償と泥の中の星。', startTown: 'forgotten_market', reqFlag: 'chapter_completed:ch4_library', completeFlag: 'chapter_completed:ch5_market', reward: '星印の欠片・砂時計への道', sort: 5 },
  { id: 'ch6_hourglass', no: 6, title: '第六章: 砂時計の記憶', summary: '繋ぎ手という言葉。', startTown: 'hourglass_city', reqFlag: 'chapter_completed:ch5_market', completeFlag: 'chapter_completed:ch6_hourglass', reward: '星印の欠片・深層炉への道', sort: 6 },
  { id: 'ch7_furnace', no: 7, title: '第七章: 深層炉の残響', summary: '旧王の残響。ヴァルハラへの扉。', startTown: 'deep_furnace_outpost', reqFlag: 'chapter_completed:ch6_hourglass', completeFlag: 'chapter_completed:ch7_furnace', reward: 'ヴァルハラ解放', sort: 7 },
  { id: 'ch8_valhalla', no: 8, title: '第八章: 空中要塞ヴァルハラ', summary: '最後の巡礼。', startTown: 'valhalla_fortress', reqFlag: 'chapter_completed:ch7_furnace', completeFlag: 'chapter_completed:ch8_valhalla', reward: '終章解放', sort: 8 },
  { id: 'epilogue_connectors', no: 9, title: '終章: 繋ぎ手', summary: '次は、君が繋ぐ番だ。', startTown: 'start_starfield', reqFlag: 'valhalla_first_clear', completeFlag: 'ending_connectors_revealed', reward: '継承', sort: 9 },
];

export type StoryEventDef = {
  id: string;
  chapterId: string;
  eventType: string;
  triggerType: string;
  triggerKey: string;
  requiredFlag?: string;
  setFlag?: string;
  title: string;
  body: string;
  npcId?: string;
  townId?: string;
  sortOrder: number;
  unlockTown?: string;
  setChapter?: string;
  objective?: string;
};

export const STORY_EVENTS: StoryEventDef[] = [
  {
    id: 'evt_start_complete',
    chapterId: 'prologue',
    eventType: 'narrative',
    triggerType: 'start_complete',
    triggerKey: 'start_complete',
    setFlag: 'start_complete',
    title: '灰の下の星',
    body: `灰の下に、まだ星が眠っている。

星原の入口に立っていた男は、そう言った。
名はアオイ。
旅人を導く者。
失われた道を覚えている者。
そして、自分の過去を多くは語らない者。

アオイ：
*「席につきたまえ。

まずは、君の名をここに記そう。
まだ何者でもない巡礼者として。
まだ何を繋ぐのかも知らない旅人として。」*

アオイ：
*「世界は、もう滅びに向かってはいない。
だが、戻りきってもいない。

だから、確かめに行くんだ。
灰の下に残ったものを。
誰かが繋ぎ止めたはずの、星の跡を。」*`,
    npcId: 'npc_aoi',
    townId: 'start_starfield',
    sortOrder: 0,
    setChapter: 'prologue',
    objective: 'アオイと話し、はじまりの星原を探索する',
  },
  {
    id: 'evt_first_victory',
    chapterId: 'prologue',
    eventType: 'milestone',
    triggerType: 'first_victory',
    triggerKey: 'first_victory',
    setFlag: 'first_victory',
    title: '最初の勝利',
    body: `倒れた魔物の影が、灰の上にほどけていく。

勝った。
ただそれだけのことなのに、足元の世界が少しだけ違って見えた。

アオイ：
*「覚えておけ。
勝つことより、進めるようになることの方が大事だ。」*`,
    npcId: 'npc_aoi',
    sortOrder: 1,
  },
  {
    id: 'evt_first_defeat',
    chapterId: 'prologue',
    eventType: 'milestone',
    triggerType: 'first_defeat',
    triggerKey: 'first_defeat',
    setFlag: 'first_defeat',
    title: '灯火への帰還',
    body: `視界が暗く沈む。
けれど、終わりではなかった。

どこか遠くで灯が揺れ、
君の意識を、町へと引き戻す。

ユイ：
*「戻ってこられたなら、それでいいの。
傷は道を閉ざすものじゃない。
次に進むための記録になる。」*`,
    npcId: 'npc_yui',
    sortOrder: 2,
  },
  {
    id: 'evt_first_job_level',
    chapterId: 'prologue',
    eventType: 'milestone',
    triggerType: 'first_job_level_up',
    triggerKey: 'first_job_level_up',
    setFlag: 'first_job_level_up',
    title: '職能の目覚め',
    body: `戦い方が、少しだけ体に馴染んだ。

剣の重さ。
祈りの熱。
魔力の流れ。
足運びの呼吸。

それは、誰かに与えられた力ではない。
君自身が、歩いたことで得た力だった。`,
    sortOrder: 3,
  },
  {
    id: 'evt_town_twilight',
    chapterId: 'ch1_twilight',
    eventType: 'town_arrival',
    triggerType: 'town_first_arrival',
    triggerKey: 'town_first_arrival:twilight_port',
    requiredFlag: 'chapter_completed:prologue',
    setFlag: 'town_first_arrival:twilight_port',
    title: '薄明の灯',
    body: `海は、夜に近い色をしていた。

港に並ぶ灯火は、船を導くためだけのものではない。
帰れなかった巡礼者の名を、忘れないための灯でもあった。

ユイ：
*「ここでは、誰かの灯を見失わないことが一番大事なの。
強さよりも、帰ってこられること。

それが、次の旅に繋がるから。」*`,
    npcId: 'npc_yui',
    townId: 'twilight_port',
    sortOrder: 10,
    setChapter: 'ch1_twilight',
    objective: 'ユイと話し、港町の異変を確かめる',
  },
  {
    id: 'evt_town_silver',
    chapterId: 'ch2_silver',
    eventType: 'town_arrival',
    triggerType: 'town_first_arrival',
    triggerKey: 'town_first_arrival:silver_mine',
    setFlag: 'town_first_arrival:silver_mine',
    title: '白銀の炉',
    body: `白銀の山は、雪ではなく灰をかぶっていた。

地の底から響く炉の音は、今も何かを打ち続けているようだった。

カイ：
*「武器ってのはな、強さのためだけにあるんじゃねえ。
折れたあとに、もう一回握るためにある。

お前が進むって言うなら、俺は打つ。」*`,
    npcId: 'npc_kai',
    townId: 'silver_mine',
    sortOrder: 20,
    setChapter: 'ch2_silver',
    objective: '鍛冶屋を訪れ、装備を整える',
  },
  {
    id: 'evt_town_mist',
    chapterId: 'ch3_mist',
    eventType: 'town_arrival',
    triggerType: 'town_first_arrival',
    triggerKey: 'town_first_arrival:mist_forest',
    setFlag: 'town_first_arrival:mist_forest',
    title: '霧の守り人',
    body: `霧は、音を吸い込んでいた。

森の奥には、誰かを待つように立ち尽くす古い標がある。

レン：
*「守るっていうのは、勝つことじゃない。
最後まで、そこに立っていることだ。

たとえ誰も覚えていなくても。」*`,
    npcId: 'npc_ren',
    townId: 'mist_forest',
    sortOrder: 30,
    setChapter: 'ch3_mist',
    objective: '霧の森を探索し、守り人を倒す',
  },
  {
    id: 'evt_town_library',
    chapterId: 'ch4_library',
    eventType: 'town_arrival',
    triggerType: 'town_first_arrival',
    triggerKey: 'town_first_arrival:moon_library',
    setFlag: 'town_first_arrival:moon_library',
    title: '月下の記録',
    body: `月下図書館には、夜が積もっていた。

本棚には、世界が救われた日の記録がある。
けれど、その記録には不自然な空白があった。

シズク：
*「記録は、真実そのものではありません。
残すと決めたものだけが、記録になる。

それを探すのが、あなたの巡礼です。」*`,
    npcId: 'npc_shizuku',
    townId: 'moon_library',
    sortOrder: 40,
    setChapter: 'ch4_library',
    objective: '図書館の記録を読み、頁喰いの影を倒す',
  },
  {
    id: 'evt_town_market',
    chapterId: 'ch5_market',
    eventType: 'town_arrival',
    triggerType: 'town_first_arrival',
    triggerKey: 'town_first_arrival:forgotten_market',
    setFlag: 'town_first_arrival:forgotten_market',
    title: '忘却の取引',
    body: `地下市に灯る明かりは、どれも少し暗かった。

ジン：
*「表で語れる話だけで世界が救えるなら、俺みたいなのは要らなかった。

なあ、巡礼者。
泥の中に落ちた星も拾うつもりか？」*`,
    npcId: 'npc_jin',
    townId: 'forgotten_market',
    sortOrder: 50,
    setChapter: 'ch5_market',
    objective: '地下市の奥を調べる',
  },
  {
    id: 'evt_town_hourglass',
    chapterId: 'ch6_hourglass',
    eventType: 'town_arrival',
    triggerType: 'town_first_arrival',
    triggerKey: 'town_first_arrival:hourglass_city',
    setFlag: 'town_first_arrival:hourglass_city',
    title: '砂時計の記憶',
    body: `砂時計の都では、風さえも遅れて吹く。

クラト：
*「過去は変わらない。
けれど、過去の見え方は変わる。

君が進めば、彼らの沈黙にも意味が生まれる。」*`,
    npcId: 'npc_krat',
    townId: 'hourglass_city',
    sortOrder: 60,
    setChapter: 'ch6_hourglass',
    objective: '都のボスを倒し、繋ぎ手の記憶に触れる',
  },
  {
    id: 'evt_town_furnace',
    chapterId: 'ch7_furnace',
    eventType: 'town_arrival',
    triggerType: 'town_first_arrival',
    triggerKey: 'town_first_arrival:deep_furnace_outpost',
    setFlag: 'town_first_arrival:deep_furnace_outpost',
    title: '深層炉の残響',
    body: `深層炉は、まだ熱を持っていた。

アオイ：
*「あれは、壊すための力じゃなかった。
きっと、誰かは本気で救おうとしていた。

救うという言葉は危うい。」*`,
    npcId: 'npc_aoi',
    townId: 'deep_furnace_outpost',
    sortOrder: 70,
    setChapter: 'ch7_furnace',
    objective: '深層炉を探索し、旧炉の番人を倒す',
  },
  {
    id: 'evt_town_valhalla',
    chapterId: 'ch8_valhalla',
    eventType: 'town_arrival',
    triggerType: 'town_first_arrival',
    triggerKey: 'town_first_arrival:valhalla_fortress',
    setFlag: 'town_first_arrival:valhalla_fortress',
    title: '空中要塞ヴァルハラ',
    body: `空は、近すぎるほど静かだった。

ヴァルハラは、世界を書き換えようとした者たちの墓標でもあった。

アオイ：
*「それでも、消していい痛みなどない。
なかったことにしていい旅などない。

この世界は、誰かが歩いた跡でできている。」*`,
    npcId: 'npc_aoi',
    townId: 'valhalla_fortress',
    sortOrder: 80,
    setChapter: 'ch8_valhalla',
    objective: '旧王の残響を倒す',
  },
  {
    id: 'evt_ending',
    chapterId: 'epilogue_connectors',
    eventType: 'ending',
    triggerType: 'epilogue_return',
    triggerKey: 'start_starfield_return',
    requiredFlag: 'valhalla_first_clear',
    setFlag: 'ending_connectors_revealed',
    title: '繋ぎ手',
    body: `ヴァルハラの空は、静かだった。

はじまりの星原に戻ると、アオイが待っていた。
その隣には、ユイ、カイ、レン、シズク、ジン、クラトがいる。

アオイ：
*「おかえり。

……いや、違うな。
ここまで辿り着いた君に、もう案内はいらない。」*

アオイ：
*「席につきたまえ。

次は、君が平和な世を繋ぐ番だ。」*

*灰の下には、まだ星が眠っている。

そして、星を探す者がいる限り、
世界は終わらない。*`,
    npcId: 'npc_aoi',
    townId: 'start_starfield',
    sortOrder: 99,
    setChapter: 'epilogue_connectors',
    objective: '巡礼を続ける',
    unlockTown: 'start_starfield',
  },
  {
    id: 'evt_boss_starfield',
    chapterId: 'prologue',
    eventType: 'boss',
    triggerType: 'boss_defeated',
    triggerKey: 'boss_defeated:boss_starfield_anomaly',
    title: '星原の静けさ',
    body: `灰の風は、少しだけ静かになった。
星原の草むらには、小さな光が戻り始めている。

アオイ：
*「星原が少し静かになった。
君が倒したのは、ただの魔物じゃない。
この土地に残っていた、古い震えの一部だ。」*`,
    npcId: 'npc_aoi',
    sortOrder: 5,
    objective: '薄明の港町へ向かう',
  },
];

export const TOWN_ARRIVAL_TEXT: Record<string, { before: string; after: string }> = {
  start_starfield: {
    before: 'はじまりの星原には、まだ落ち着かない灰の気配が漂っている。',
    after: '灰の風は静かになった。星原の草むらに、小さな光が戻り始めている。',
  },
  twilight_port: {
    before: '港の灯が、いつもより弱く揺れている。',
    after: '灯火が安定した。帰れなかった名の灯が、またひとつ灯された。',
  },
};

export type NpcStoryLine = { npcId: string; stage: number; requiredFlag?: string; title: string; body: string; setFlag?: string };

export const NPC_STORY_DIALOGUES: NpcStoryLine[] = [
  { npcId: 'npc_aoi', stage: 0, title: 'アオイ', body: 'アオイ：\n*「来たか。\nここは、はじまりの星原。\n灰の下に、まだ星が眠っている場所だ。」*' },
  { npcId: 'npc_aoi', stage: 1, title: 'アオイ', body: 'アオイ：\n*「巡礼者は、ただ強くなればいいわけじゃない。\n見つけたものを持ち帰って、誰かに繋ぐ。\nそれが、この旅の意味だ。」*' },
  { npcId: 'npc_aoi', stage: 2, title: 'アオイ', body: 'アオイ：\n*「俺も昔、似たような道を歩いたことがある。\n……歩いた、というより、走り続けるしかなかったのかもしれないな。」*' },
  { npcId: 'npc_aoi', stage: 3, requiredFlag: 'chapter_completed:ch6_hourglass', title: 'アオイ', body: 'アオイ：\n*「繋ぎ手。\n昔、そう呼ばれた者たちがいた。\n切れかけたものを、無理やりにでも繋ごうとした者たちだ。」*' },
  { npcId: 'npc_aoi', stage: 4, requiredFlag: 'town_first_arrival:valhalla_fortress', title: 'アオイ', body: 'アオイ：\n*「空に残った要塞は、墓標みたいなものだ。\nだが、墓標なら、そこには名前があるはずだ。」*' },
  { npcId: 'npc_aoi', stage: 5, requiredFlag: 'ending_connectors_revealed', title: 'アオイ', body: 'アオイ：\n*「もう、俺が道を示す必要はない。\n君は見つけ、選び、繋いだ。\nなら次は、君が誰かの道しるべになる番だ。」*' },
  { npcId: 'npc_yui', stage: 0, title: 'ユイ', body: 'ユイ：\n*「薄明の港へようこそ。\nここでは、灯を見失わないことが一番大事なの。」*' },
  { npcId: 'npc_yui', stage: 1, title: 'ユイ', body: 'ユイ：\n*「救難の便りは、弱さの印じゃない。\n誰かが君を待っている証拠なの。」*' },
  { npcId: 'npc_kai', stage: 0, title: 'カイ', body: 'カイ：\n*「折れた武器は終わりじゃねえ。\nもう一回握るために、打ち直すんだ。」*' },
  { npcId: 'npc_ren', stage: 0, title: 'レン', body: 'レン：\n*「守るっていうのは、勝つことじゃないと思うんだ。\n最後まで、そこに立っていることだよ。」*' },
  { npcId: 'npc_shizuku', stage: 0, title: 'シズク', body: 'シズク：\n*「記録は、真実そのものではありません。\n残すと決めたものだけが、記録になるのです。」*' },
  { npcId: 'npc_jin', stage: 0, title: 'ジン', body: 'ジン：\n*「フン。綺麗な道だけを歩いて、世界の底が見えるものか。」*' },
  { npcId: 'npc_krat', stage: 0, title: 'クラト', body: 'クラト：\n*「過去は変わらない。\nけど、過去の意味は変わる。」*' },
];

export const JOBS = ['剣士', '重騎士', '狩人', '魔術師', '祈祷師', '斥候', '機工師', '格闘士'] as const;

export const JOB_QUEST_TITLES: Record<string, Record<number, { title: string; desc: string }>> = {
  剣士: { 10: { title: '刃の重さ', desc: '剣の重さを知る。' }, 30: { title: '折れない構え', desc: '構えを磨く。' }, 50: { title: '黄昏を斬る', desc: '黄昏の一太刀。' }, 70: { title: '星を断つ者', desc: '奥義に至る。' } },
  魔術師: { 10: { title: '灰火の制御', desc: '魔力を制する。' }, 30: { title: '魔力に呑まれる者', desc: '代償を知る。' }, 50: { title: '星術の代償', desc: '星を呼ぶ覚悟。' }, 70: { title: '星を呼ぶ者', desc: '星術の極み。' } },
  祈祷師: { 10: { title: '灯火を絶やさず', desc: '灯を守る。' }, 30: { title: '救えない祈り', desc: '祈りの限界。' }, 50: { title: '繋ぎの光', desc: '光を渡す。' }, 70: { title: '巡礼の祈り', desc: '巡礼の極意。' } },
  重騎士: { 10: { title: '盾の重さ', desc: '盾を知る。' }, 30: { title: '城塞の心', desc: '守る覚悟。' }, 50: { title: '白銀の誓い', desc: '誓いを貫く。' }, 70: { title: '城塞を繋ぐ者', desc: '城塞の極意。' } },
  狩人: { 10: { title: '矢の呼吸', desc: '一射を極める。' }, 30: { title: '獲物の影', desc: '影を追う。' }, 50: { title: '星影の矢', desc: '星を射る。' }, 70: { title: '残響を射る者', desc: '弓の極意。' } },
  斥候: { 10: { title: '影の足取り', desc: '影を歩く。' }, 30: { title: '毒と刃', desc: '刃を研ぐ。' }, 50: { title: '黒狐の道', desc: '闇を渡る。' }, 70: { title: '影渡り', desc: '影の極意。' } },
  機工師: { 10: { title: '炉の音', desc: '機構を知る。' }, 30: { title: '解析の眼', desc: '弱点を見る。' }, 50: { title: '深層穿ち', desc: '深層を穿つ。' }, 70: { title: '創造砲', desc: '砲の極意。' } },
  格闘士: { 10: { title: '正拳の型', desc: '型を知る。' }, 30: { title: '血潮の構え', desc: '構えを極める。' }, 50: { title: '破戒の拳', desc: '拳を放つ。' }, 70: { title: '拳闘王', desc: '拳の極意。' } },
};

export const JOURNAL_LOCKED_PAGES = [
  { flag: 'chapter_completed:ch4_library', label: '空に沈む要塞' },
  { flag: 'chapter_completed:ch6_hourglass', label: '繋ぎ手' },
  { flag: 'ending_connectors_revealed', label: '円卓の席' },
];
