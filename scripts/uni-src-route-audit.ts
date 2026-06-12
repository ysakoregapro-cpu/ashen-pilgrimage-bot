/** uni-src-route-audit — npx tsx scripts/uni-src-route-audit.ts */
import { getDb } from '../src/db/database';
import { initAuditDb, PHASE2_UNI_MATS, EIGHT_JOB_ROUTES } from './audit/acquisitionIndex';
import {
  UNI_FORGE_MATERIAL_IDS, UNI_FORGE_DROP_RATE, SRC_FORGE_MATERIAL_ID,
  SRC_FORGE_MATERIAL_DROP_RATE, REMATCH_MATERIAL_BOSSES, SRC_FARM_MONSTER_IDS,
} from '../src/db/seedData/forgeMaster';
import { writeReport, writeCsv, mdTable } from './audit/reportWriter';

const BOSS_CANDIDATES: Record<string, { bossId: string; label: string; town: string; lv: string; rate: string; reason: string; concern: string }> = {
  mat_twilight_blade_shard: { bossId: 'mon_ash_knight', label: '灰冠騎士', town: '灰冠の王都跡', lv: '35-45', rate: '18%', reason: '剣系・中盤', concern: 'ヴァルハラ前' },
  mat_starfield_old_steel: { bossId: 'mon_star_slime_king', label: '星屑王', town: 'はじまりの星原', lv: '1-10', rate: '20%', reason: '序盤剣士', concern: '早期入手' },
  mat_silver_castle_core: { bossId: 'mon_silver_golem', label: '白銀ゴーレム', town: '白銀鉱山街', lv: '10-15', rate: '18%', reason: '重騎士帯', concern: '—' },
  mat_old_furnace_hammer_core: { bossId: 'mon_furnace_keeper', label: '炉熱の番人', town: '深層炉', lv: '50+', rate: '15%', reason: '槌系', concern: '後半' },
  mat_echo_bowstring: { bossId: 'mon_mist_beast', label: '霧獣', town: '霧深き森', lv: '15-20', rate: '18%', reason: '狩人帯', concern: '—' },
  mat_moon_arrowhead: { bossId: 'mon_moon_observer', label: '月下の観測者', town: '星落ちの観測所', lv: '55+', rate: '15%', reason: '既存rematch boss', concern: 'shared with obsidian' },
  mat_mist_lantern_stardust: { bossId: 'mon_mist_warden', label: '霧守り', town: '霧深き森', lv: '15-20', rate: '18%', reason: '魔術師', concern: '—' },
  mat_ash_star_magic_core: { bossId: 'mon_ash_wraith', label: '灰の亡霊', town: '灰冠', lv: '35+', rate: '15%', reason: '魔力系', concern: '—' },
  mat_lampkeeper_holy_oil: { bossId: 'mon_silent_warden', label: '沈黙の守護', town: '沈黙の修道院', lv: '45+', rate: '18%', reason: '祈祷師', concern: '—' },
  mat_pilgrim_prayer_cloth: { bossId: 'mon_prayer_echo', label: '祈りの残響', town: '祈りの丘', lv: '12', rate: '20%', concern: '町に探索なし', reason: '祈祷系' },
  mat_ash_mirror_fragment: { bossId: 'mon_glass_specter', label: '硝子の亡霊', town: '硝子沼', lv: '38+', rate: '18%', reason: '斥候', concern: '—' },
  mat_shadowstep_black_thread: { bossId: 'mon_black_lantern_wraith', label: '黒灯の残影', town: '黒灯りの路地', lv: '52+', rate: '15%', reason: '既存rematch', concern: 'shared cinder mat' },
  mat_deep_furnace_gear: { bossId: 'mon_furnace_defense', label: '炉心防衛', town: 'ヴァルハラ', lv: '66+', rate: '15%', reason: '機工師終盤', concern: 'ヴァルハラ前後' },
  mat_black_iron_powder_case: { bossId: 'mon_black_iron', label: '黒鉄処刑人', town: '赤灰の砦', lv: '42+', rate: '18%', reason: '火薬系', concern: '—' },
  mat_black_fox_clawmark: { bossId: 'mon_red_ash_beast', label: '赤灰獣', town: '赤灰の砦', lv: '42+', rate: '18%', reason: '格闘士', concern: '—' },
  mat_ash_fist_bone: { bossId: 'mon_dragonbone_spirit', label: '竜骨霊', town: '竜骨の峡谷', lv: '40+', rate: '15%', reason: '拳系', concern: '—' },
};

function main() {
  initAuditDb();
  const db = getDb();

  const uniRows = UNI_FORGE_MATERIAL_IDS.map((id) => {
    const item = db.prepare('SELECT name FROM items WHERE id=?').get(id) as { name: string };
    const boss = REMATCH_MATERIAL_BOSSES[id as keyof typeof REMATCH_MATERIAL_BOSSES];
    return {
      id, name: item?.name ?? id, usedBy: '全8職 Uni化（各1）', qty: '1+1',
      boss: boss?.label ?? '?', rematch: boss?.monsterId ?? '?',
      rate: `${UNI_FORGE_DROP_RATE * 100}%`, preValhalla: boss?.areaHint !== '空中要塞ヴァルハラ' ? 'YES' : 'NO',
    };
  });

  const srcName = (db.prepare('SELECT name FROM items WHERE id=?').get(SRC_FORGE_MATERIAL_ID) as { name: string })?.name;
  const farmMonsters = SRC_FARM_MONSTER_IDS.map((id) => {
    const m = db.prepare('SELECT name, area_tag, level FROM monsters WHERE id=?').get(id) as { name: string; area_tag: string; level: number };
    return `${m?.name ?? id} (${m?.area_tag} Lv${m?.level})`;
  });

  const manifestRows = db.prepare(`
    SELECT sw.id, sw.base_item_id, sw.name, sw.manifest_requirements_json, i.name as base_name
    FROM src_weapons sw JOIN items i ON sw.base_item_id = i.id
  `).all() as Array<{ id: string; base_item_id: string; name: string; manifest_requirements_json: string; base_name: string }>;

  const phase2MatRows: string[][] = [];
  for (const group of PHASE2_UNI_MATS) {
    for (const m of group.mats) {
      const exists = db.prepare('SELECT id FROM items WHERE id=?').get(m.id);
      const similar = db.prepare(`SELECT id, name FROM items WHERE name LIKE ? OR id LIKE ? LIMIT 3`).all(`%${m.name.slice(0, 2)}%`, `%${m.id.split('_').pop()}%`) as Array<{ id: string; name: string }>;
      const cand = BOSS_CANDIDATES[m.id];
      phase2MatRows.push([
        m.id, m.name, group.job, exists ? 'EXISTS' : 'NOT_IN_SEED',
        similar.map((s) => s.id).join('; ') || '—',
        cand?.bossId ?? 'UNKNOWN', cand?.label ?? '—', cand?.rate ?? '—', cand?.reason ?? '—', cand?.concern ?? '—',
      ]);
    }
  }

  const srcDual = [
    ['Kai (kaiSrcTransform)', 'Uni + mat_star_pilgrim_echo×1', 'facilitySystem 鍛冶 kai_src', 'YES', 'player-facing'],
    ['manifest (manifestSrcWeapon)', 'per-weapon gold + src_core mats', '/upgrade manifest', 'YES (SR filter bug?)', 'legacy per-weapon mats'],
    ['Phase2 GPT plan', 'Uni + 星巡の残響×3 + 5000G', 'not implemented', 'N/A', 'align with Kai'],
  ];

  const md = [
    '# Uni / Src Route Audit',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    '## Current Uni materials (shared)',
    mdTable(['id', 'name', 'usedBy', 'qty', 'rematch boss', 'rate', 'pre-Valhalla'], uniRows.map((r) => [r.id, r.name, r.usedBy, r.qty, r.boss, r.rate, r.preValhalla])),
    '',
    '**Confirmed: all 8 jobs share the same 2 Uni materials**',
    '',
    '## Current Src material',
    `- ${SRC_FORGE_MATERIAL_ID} (${srcName}) ×1 for Kai`,
    `- Drop: ${SRC_FORGE_MATERIAL_DROP_RATE * 100}% from rematch/normal on: ${farmMonsters.join('; ')}`,
    `- Valhalla accessible: YES (after unlock)`,
    '',
    '## Src dual path',
    mdTable(['Path', 'Condition', 'UI', 'Reachable', 'Notes'], srcDual),
    '',
    '### Impact of unifying to Kai',
    '- manifestSrcWeapon uses per-weapon src_core mats (different from Kai)',
    '- `/upgrade manifest` still exposed; filters SR rarity (may not list Uni)',
    '- Kai path: 1 mat only, sets valhalla_unlocked flag',
    '- Phase2 plan (×3 + 5000G) requires kaiForgeSystem + UI text change',
    '',
    '## Phase2 Uni materials (16) — seed feasibility',
    mdTable(['item_id', 'name', 'job', 'in_seed', 'similar', 'boss_id', 'boss', 'rate', 'reason', 'concern'], phase2MatRows),
    '',
    '## 8-job route Src note',
    ...EIGHT_JOB_ROUTES.map((r) => {
      const sw = db.prepare('SELECT base_item_id FROM src_weapons WHERE id=?').get(r.src) as { base_item_id: string } | undefined;
      const baseMatch = sw?.base_item_id === r.uni ? 'OK' : `MISMATCH base=${sw?.base_item_id}`;
      return `- ${r.job}: ${r.uni} → ${r.src} (${baseMatch})`;
    }),
    '',
    '## Phase2 Src plan feasibility',
    '- Valhalla explore/rematch/raid: **existing** SRC_FARM_MONSTER_IDS + area pools',
    '- Changing qty 1→3: code-only in kaiForgeSystem',
    '- Adding 5000G: code-only in kaiForgeSystem',
    '- No migration required for materials (mat exists)',
  ].join('\n');

  writeReport('uni-src-route-audit.md', md);
  writeCsv('uni-src-route-audit.csv', ['item_id', 'name', 'job', 'in_seed', 'similar_ids', 'boss_id', 'boss_label', 'rate', 'reason', 'concern'], phase2MatRows);
  writeCsv('uni-src-dual-path.csv', ['path', 'condition', 'ui', 'reachable', 'notes'], srcDual);
  console.log('✅ uni-src-route-audit');
}

main();
