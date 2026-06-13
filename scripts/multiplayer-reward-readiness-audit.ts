/** multiplayer-reward-readiness-audit — npx tsx scripts/multiplayer-reward-readiness-audit.ts */
import fs from 'fs';
import path from 'path';
import { getDb } from '../src/db/database';
import { VALHALLA_BOSS_MONSTER_IDS, VALHALLA_EMBLEM_ID } from '../src/db/seedData/valhallaRewardMaster';
import { grantCoopBattleRewards } from '../src/systems/coop/coopRewardSystem';
import { RAID_BOSS_ID } from '../src/systems/coop/coopTypes';

type ReadinessItem = { area: string; status: 'ready' | 'partial' | 'missing'; notes: string };

const items: ReadinessItem[] = [];
const futurePhases: string[] = [];

function add(area: string, status: ReadinessItem['status'], notes: string) {
  items.push({ area, status, notes });
}

function main() {
  const db = getDb();
  const coopRewardSrc = fs.readFileSync(
    path.join(process.cwd(), 'src/systems/coop/coopRewardSystem.ts'),
    'utf8',
  );
  const battleSrc = fs.readFileSync(
    path.join(process.cwd(), 'src/systems/battleSystem.ts'),
    'utf8',
  );

  console.log('## multiplayer-reward-readiness-audit\n');

  // Per-participant rewards (coop)
  if (coopRewardSrc.includes('for (const p of participants)') && coopRewardSrc.includes('hasGrantedReward')) {
    add('救難/レイド個別報酬', 'ready', 'grantCoopBattleRewards が参加者ごとに INSERT OR IGNORE で付与');
  } else {
    add('救難/レイド個別報酬', 'missing', '参加者ループ/重複防止なし');
  }

  // MVP exclusive?
  if (!coopRewardSrc.includes('MVP') && coopRewardSrc.includes('isLeader')) {
    add('MVP独占なし', 'ready', 'リーダー/ヘルパーで差はあるが全員にEXP/GOLD');
  } else {
    add('MVP独占なし', 'partial', '要コード確認');
  }

  // Rescue helper rewards
  if (coopRewardSrc.includes('rescueHelperRewardAllowed')) {
    add('救難参加者報酬', 'ready', 'ヘルパーにも報酬（日次上限あり）');
  } else {
    add('救難参加者報酬', 'missing', 'rescueHelperRewardAllowed 未実装');
  }

  // Raid rewards
  if (coopRewardSrc.includes("mode === 'raid'") && coopRewardSrc.includes('acc_raid_random')) {
    add('レイド周回報酬', 'ready', 'レイドモードでUR武器8%/アクセ/素材');
  } else {
    add('レイド周回報酬', 'partial', 'レイド報酬テーブル要確認');
  }

  // Valhalla boss solo rewards
  if (battleSrc.includes('resolveValhallaBossVictory') && battleSrc.includes('grantValhallaBossRewards')) {
    add('ソロヴァルハラボス報酬', 'ready', 'Phase2.6 valhallaRewardSystem 統合済');
  } else {
    add('ソロヴァルハラボス報酬', 'missing', 'battleSystem 未統合');
  }

  // Valhalla emblem in coop
  if (coopRewardSrc.includes(VALHALLA_EMBLEM_ID)) {
    add('マルチ徽章報酬', 'ready', 'coop に徽章付与あり');
  } else {
    add('マルチ徽章報酬', 'missing', 'coopRewardSystem に valhalla_emblem なし — ヴァルハラボス専用マルチ未接続');
    futurePhases.push('ヴァルハラボス co-op 報酬テーブル（徽章・頁・装備）');
  }

  // Valhalla boss coop recruit
  const indexSrc = fs.existsSync(path.join(process.cwd(), 'src/index.ts'))
    ? fs.readFileSync(path.join(process.cwd(), 'src/index.ts'), 'utf8')
    : '';
  const hasValhallaCoopRecruit = VALHALLA_BOSS_MONSTER_IDS.some((id) => indexSrc.includes(id) && indexSrc.includes('coop'));
  if (hasValhallaCoopRecruit) {
    add('ヴァルハラボス専用募集', 'partial', '一部導線あり');
  } else {
    add('ヴァルハラボス専用募集', 'missing', '救難/レイド募集は mon_bandit / RAID_BOSS のみ');
    futurePhases.push('ヴァルハラボス専用 co-op 募集導線');
  }

  // Multi HP/break for valhalla
  add('マルチHP/ブレイク調整', 'partial', `レイドボス=${RAID_BOSS_ID} は RAID_HP_MULT。ヴァルハラ3体はソロ戦のみ`);

  // Join conditions
  add('参加最低条件', 'partial', 'coop recruit に level/story ゲートは recruit 作成側で可変 — ヴァルハラ専用条件なし');

  // Reward display
  add('ボス周回専用報酬表示', 'partial', 'ソロ勝利メッセージに初回/徽章表示。co-op は汎用EXP/GOLD行');

  // DB tables
  const coopRewardsTable = db.prepare(`
    SELECT name FROM sqlite_master WHERE type='table' AND name='coop_rewards'
  `).get();
  add('coop_rewards DB', coopRewardsTable ? 'ready' : 'missing', coopRewardsTable ? '参加者別 reward_json 保存' : 'テーブルなし');

  for (const id of VALHALLA_BOSS_MONSTER_IDS) {
    const m = db.prepare('SELECT id FROM monsters WHERE id = ?').get(id);
    if (!m) items.push({ area: `monster ${id}`, status: 'missing', notes: 'DB未登録' });
  }

  console.log('| 項目 | 状態 | メモ |');
  console.log('| --- | --- | --- |');
  for (const i of items) {
    console.log(`| ${i.area} | ${i.status} | ${i.notes} |`);
  }

  console.log('\n## 方針（設計）');
  console.log('- 参加者全員に個別報酬: co-op は ready、ヴァルハラボス co-op は未接続');
  console.log('- ソロ撃破報酬減額なし: valhallaRewardSystem で固定レンジ');
  console.log('- マルチ価値は倍率より安定性・速度（将来調整）');

  if (futurePhases.length) {
    console.log('\n## 今後必要な Phase');
    for (const p of [...new Set(futurePhases)]) console.log(`- ${p}`);
  }

  const missing = items.filter((i) => i.status === 'missing');
  if (missing.length) {
    console.log(`\nWARN: ${missing.length} missing areas (expected for valhalla co-op — audit only)`);
  } else {
    console.log('\nOK — no critical missing (co-op base ready)');
  }
}

main();
