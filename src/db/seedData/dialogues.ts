import type Database from 'better-sqlite3';

type D = { npc: string; type: string; text: string; variant?: number };

const DIALOGUES: D[] = [
  // 宿屋の受付リナ
  { npc: 'npc_rina', type: 'greeting', text: '「いらっしゃい。旅人の顔ね。\n眠る場所があるだけで、次の日の足取りは変わるものよ。」' },
  { npc: 'npc_rina', type: 'smalltalk', text: '「星原の夜は静かすぎるの。\n静かすぎる場所では、自分の足音まで誰かのものに聞こえるわ。」' },
  { npc: 'npc_rina', type: 'explain', text: '「ここではHPとMPを回復できるわ。\n深く潜る前には、無理せず休んでいきなさい。」' },
  // 鍛冶師グレン
  { npc: 'npc_gren', type: 'greeting', text: '「武器を見せろ。\n傷み方を見れば、どんな戦い方をしてるか大体わかる。」' },
  { npc: 'npc_gren', type: 'smalltalk', text: '「白銀は硬いだけじゃねえ。\n何度も叩けば、持ち主の癖まで覚える。」' },
  { npc: 'npc_gren', type: 'explain', text: '「強化、修理、分解。\nどれも大事だ。低レア装備も素材になる。雑に捨てるなよ。」' },
  { npc: 'npc_gren', type: 'hint', text: '「古い武器の中には、まだ名前を思い出していないものがある。\nそういうのは、ただ叩くだけじゃ目覚めねえ。」' },
  // 古文書の証人
  { npc: 'npc_doc_witness', type: 'greeting', text: '「本を探しているのか。\nそれとも、本に探されているのか。」' },
  { npc: 'npc_doc_witness', type: 'smalltalk', text: '「失われた名前ほど、紙の端に残るものだ。」' },
  { npc: 'npc_doc_witness', type: 'explain', text: '「ここでは敵や素材、古い武器の記録を確かめられる。\nただし、すべての答えが文字で残るとは限らない。」' },
  { npc: 'npc_doc_witness', type: 'hint', text: '「名前を失った武器ほど、長く眠る。\nだが、持ち主が正しければ、名は戻る。」' },
  // アオイ（導き手）
  { npc: 'npc_aoi', type: 'greeting', text: '「ようこそ、星原へ。\nここから巡礼が始まる。焦らず、足元から進め。」' },
  { npc: 'npc_aoi', type: 'greeting', variant: 1, text: '「また来たね。今日はどこまで行く？」' },
  { npc: 'npc_aoi', type: 'smalltalk', text: '「灰の下には、まだ星が眠っている。\n見えないからこそ、探す価値がある。」' },
  { npc: 'npc_aoi', type: 'explain', text: '「職能を選び、装備を整え、探索へ向かう。\n町では休み、鍛冶し、人の話を聞く。それが旅の基本だ。」' },
  { npc: 'npc_aoi', type: 'hint', text: '「名も持たない古剣が、いつか別の名を取り戻す話がある。\n持ち主と場所、そして覚悟が揃った時だけだ。」' },
  // ユイ
  { npc: 'npc_yui', type: 'greeting', text: '「お疲れの顔ね。ここで休んでいきなさい。\n灯火は、まだ消えていないわ。」' },
  { npc: 'npc_yui', type: 'smalltalk', text: '「港の夜は長い。でも、灯台の光はずっとここにある。」' },
  { npc: 'npc_yui', type: 'explain', text: '「救護所では傷を癒せる。\n危ない探索の前に、救難の便りを出しておくのも手よ。」' },
  { npc: 'npc_yui', type: 'hint', text: '「繋がりの糸は、途切れても完全には消えない。\n誰かの手を借りた旅は、いつか返す番が来る。」' },
  // カイ
  { npc: 'npc_kai', type: 'greeting', text: '「炉は冷えていない。用件を言え。」' },
  { npc: 'npc_kai', type: 'explain', text: '「装備の強化、修理、分解。\n伝承の武器を目覚めさせる仕事も、ここで引き受ける。」' },
  { npc: 'npc_kai', type: 'hint', text: '「Srcと呼ばれる名は、後から刻まれる。\n先に刻印の欠片を集めても、武器が応えなければ意味はない。」' },
  // シズク
  { npc: 'npc_shizuku', type: 'greeting', text: '「静かに。ここでは紙の音さえ記録になる。」' },
  { npc: 'npc_shizuku', type: 'explain', text: '「図書館では、敵の傾向や素材、古い武器の記録を調べられる。\n解析の知恵は、戦いの前に役立つ。」' },
  { npc: 'npc_shizuku', type: 'hint', text: '「禁書区画の奥に、答えのない書物がある。\n無答の守護者は、問いより記録を好む。」' },
  // 灯台守セリア
  { npc: 'npc_seria', type: 'greeting', text: '「いらっしゃい。\n潮の匂いが強い日は、外に出るだけでも体力を持っていかれるわ。\n今日はどうする？」' },
  { npc: 'npc_seria', type: 'smalltalk', text: '「灯台の火は、私が消すまで消えない。\n…たぶんね。」' },
  { npc: 'npc_seria', type: 'explain', text: '「海風の宿では、旅の疲れを癒せるわ。」' },
  // 記録係トマ
  { npc: 'npc_toma', type: 'greeting', text: '「記録係トマだ。旅の記録、預かるよ。」' },
  { npc: 'npc_toma', type: 'smalltalk', text: '「古い訓練場では、まだ剣の音が残ってる。\n人のいない場所ほど、音は長く残る。」' },
  // 炉の証人 / 端末風
  { npc: 'npc_furnace_witness', type: 'greeting', text: '「接続……不安定。\n巡礼者……認識。」' },
  { npc: 'npc_furnace_witness', type: 'smalltalk', text: '「制御権限……消失。\n炉心……応答なし。\n旧王……未確認。」' },
  { npc: 'npc_furnace_witness', type: 'explain', text: '「この端末では共闘探索の接続を管理します。\n複数名で侵入する場合、防衛機構の挙動が変化します。」' },
  { npc: 'npc_furnace_witness', type: 'hint', text: '「深層炉心……封鎖中。\n認証鍵……灰、星、残響……照合不能。」' },
  // 古い証人
  { npc: 'npc_old_witness', type: 'hint', text: '「鏡は、強い者を映すんじゃない。\n自分を見失わなかった者だけを、奥へ通す。」' },
  // ヴァルハラ守衛
  { npc: 'npc_valhalla_guard', type: 'greeting', text: '「ここから先は、雲の上の戦場だ。\n覚悟を持って来い。」' },
  { npc: 'npc_valhalla_guard', type: 'explain', text: '「要塞探索は、共闘掲示板から募集できる。\n四人まで。人数が増えれば、防衛も厚くなる。」' },
  // 雨宿りの老人
  { npc: 'npc_rain_elder', type: 'greeting', text: '「……雨音が、ずっと降っている。\n休んでいくといい。」' },
  { npc: 'npc_rain_elder', type: 'smalltalk', text: '「この村、人はいない。\nでも、雨だけは覚えている。」' },
  // 王都の証人
  { npc: 'npc_capital_witness', type: 'greeting', text: '「灰冠の王都へようこそ。\n…いや、もう王都ではないな。」' },
  { npc: 'npc_capital_witness', type: 'hint', text: '「玉座の前では、旧王の影がまだ蠢いている。\n覚悟なき者は、近づくな。」' },
];

const GENERIC: Record<string, string> = {
  greeting: '「やあ、旅人。\n今日はどうする？」',
  smalltalk: '「この辺りの話なら、いくらでもある。\n…どれも、長い話だが。」',
  explain: '「ここでできることは、町の掲示や受付に書いてある。\n分からなければ、旅の手引きを開いてみるといい。」',
  hint: '「道の先に、まだ名前のない何かがある気がする。\n…噂だけどな。」',
};

export function seedDialogues(db: Database.Database): void {
  const ins = db.prepare(`
    INSERT INTO npc_dialogues (npc_id, dialogue_type, text, variant) VALUES (?, ?, ?, ?)
  `);
  for (const d of DIALOGUES) {
    ins.run(d.npc, d.type, d.text, d.variant ?? 0);
  }
}

export function ensureDialoguesSeed(db: Database.Database): void {
  const row = db.prepare('SELECT COUNT(*) as c FROM npc_dialogues').get() as { c: number };
  if (row.c === 0) seedDialogues(db);
}

export function getGenericDialogue(type: string): string {
  return GENERIC[type] ?? GENERIC.greeting!;
}
