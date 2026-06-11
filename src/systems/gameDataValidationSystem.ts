import { getDb } from '../db/database';
import { GAME_ELEMENTS, normalizeElement } from '../db/seedData/elementMaster';
import { FEATURE_UNLOCKS, CHAPTER_LEVEL_BANDS } from '../db/seedData/progressionMaster';
import { resolveSkillEffect, SKILL_OVERRIDES, EFFECT_TYPE_MAP } from '../db/seedData/skillEffectMaster';
import { ACQUISITION_OVERRIDES } from '../db/seedData/equipmentMaster';
import { getRoadmapHints } from './progressionSystem';
import { getEnhanceRequirement } from './enhanceSystem';
import { AREAS } from '../db/seedData/areas';

export type ValidationIssue = { severity: 'error' | 'warn'; category: string; message: string };

export function validateGameDataStatic(): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const req1 = getEnhanceRequirement(0, 'N');
  if (req1.stoneId !== 'upg_rough_stone') {
    issues.push({ severity: 'error', category: 'upgrade', message: '+1強化が粗い強化石を使っていません' });
  }
  const req4 = getEnhanceRequirement(3, 'N');
  if (req4.stoneId !== 'upg_stone') {
    issues.push({ severity: 'error', category: 'upgrade', message: '+4強化が強化石を使っていません' });
  }
  for (const f of FEATURE_UNLOCKS) {
    if (!f.requiredFlag) issues.push({ severity: 'error', category: 'progression', message: `機能 ${f.feature} に requiredFlag なし` });
  }
  const roughAreas = AREAS.filter((a) => a.rewards.includes('upg_rough_stone') || a.town === 'start_starfield');
  if (!roughAreas.length) {
    issues.push({ severity: 'error', category: 'upgrade', message: '粗い強化石の序盤入手経路がありません' });
  }
  for (const [skillId, ov] of Object.entries(SKILL_OVERRIDES)) {
    if (!ov.implemented && ov.statusEffect) {
      issues.push({ severity: 'warn', category: 'skill', message: `スキル ${skillId} オーバーライド未実装` });
    }
  }
  return issues;
}

export function validateGameData(opts?: { userId?: string }): ValidationIssue[] {
  const issues = validateGameDataStatic();
  let db;
  try {
    db = getDb();
  } catch {
    issues.push({ severity: 'warn', category: 'system', message: 'DB未接続 — 静的検証のみ実行（npm rebuild でDB検証可能）' });
    return issues;
  }

  // Equipment elements
  const equip = db.prepare(`
    SELECT e.item_id, i.name, e.element FROM equipment e JOIN items i ON e.item_id = i.id
  `).all() as Array<{ item_id: string; name: string; element: string | null }>;
  for (const e of equip) {
    const el = normalizeElement(e.element);
    if (!GAME_ELEMENTS.includes(el)) {
      issues.push({ severity: 'error', category: 'equipment', message: `装備 ${e.name} の属性が不正: ${e.element}` });
    }
  }

  // Skills
  const skills = db.prepare(`SELECT id, name, element, effect_type, status_effect FROM skills`).all() as Array<{
    id: string; name: string; element: string | null; effect_type: string | null; status_effect: string | null;
  }>;
  for (const s of skills) {
    normalizeElement(s.element);
    const fx = resolveSkillEffect(s.id, s.effect_type, s.status_effect);
    if (!fx.implemented && (s.effect_type || s.status_effect)) {
      issues.push({ severity: 'warn', category: 'skill', message: `スキル ${s.name} (${s.id}) の効果が未実装: ${s.effect_type}/${s.status_effect}` });
    }
    if (s.effect_type && !EFFECT_TYPE_MAP[s.effect_type] && !SKILL_OVERRIDES[s.id] && s.effect_type !== 'damage') {
      issues.push({ severity: 'warn', category: 'skill', message: `スキル ${s.name}: 未知の effect_type=${s.effect_type}` });
    }
  }

  // Monsters
  const monsters = db.prepare(`SELECT id, name, element, weaknesses_json FROM monsters`).all() as Array<{
    id: string; name: string; element: string | null; weaknesses_json: string | null;
  }>;
  for (const m of monsters) {
    if (!m.element) issues.push({ severity: 'warn', category: 'monster', message: `敵 ${m.name} に属性未設定` });
  }

  // Acquisition
  const items = db.prepare(`SELECT id, name, category, acquisition_json FROM items`).all() as Array<{
    id: string; name: string; category: string; acquisition_json: string | null;
  }>;
  for (const item of items) {
    if (item.category === 'equipment' && !item.acquisition_json && !ACQUISITION_OVERRIDES[item.id]) {
      issues.push({ severity: 'warn', category: 'acquisition', message: `装備 ${item.name} に入手経路未設定` });
    }
    if (['material', 'upgrade_stone', 'common_material'].includes(item.category) && !item.acquisition_json) {
      issues.push({ severity: 'warn', category: 'acquisition', message: `素材 ${item.name} に入手経路未設定` });
    }
  }

  // Upgrade material availability — rough stone before ch2
  const roughAreas = AREAS.filter((a) => a.rewards.includes('upg_rough_stone') || a.town === 'start_starfield');
  if (!roughAreas.length) {
    issues.push({ severity: 'error', category: 'upgrade', message: '粗い強化石の序盤入手経路がありません' });
  }

  // Enhance req sanity
  const req1 = getEnhanceRequirement(0, 'N');
  if (req1.stoneId !== 'upg_rough_stone') {
    issues.push({ severity: 'error', category: 'upgrade', message: '+1強化が粗い強化石を使っていません' });
  }
  const req4 = getEnhanceRequirement(3, 'N');
  if (req4.stoneId !== 'upg_stone') {
    issues.push({ severity: 'error', category: 'upgrade', message: '+4強化が強化石を使っていません' });
  }

  // Drop table integrity
  const itemIds = new Set(items.map((i) => i.id));
  for (const m of db.prepare('SELECT id, drop_pool_json FROM monsters').all() as Array<{ id: string; drop_pool_json: string }>) {
    const drops = JSON.parse(m.drop_pool_json || '[]') as Array<{ item_id: string }>;
    for (const d of drops) {
      if (!itemIds.has(d.item_id)) {
        issues.push({ severity: 'error', category: 'drop', message: `敵 ${m.id} が存在しないアイテム ${d.item_id} をドロップ` });
      }
    }
  }

  // Roadmap sanity with test user if provided
  if (opts?.userId) {
    try {
      const hints = getRoadmapHints(opts.userId);
      if (hints.now.some((h) => h.includes('鍛冶') || h.includes('レイド') || h.includes('ヴァルハラ'))) {
        const player = db.prepare('SELECT level FROM players WHERE user_id = ?').get(opts.userId) as { level: number } | undefined;
        if (player && player.level < 10 && hints.now.some((h) => h.includes('鍛冶'))) {
          issues.push({ severity: 'warn', category: 'roadmap', message: '序盤プレイヤーの「今できること」に鍛冶案内が含まれています' });
        }
      }
    } catch { /* player may not exist */ }
  }

  // Chapter bands exist
  for (const ch of ['prologue', 'ch1_twilight', 'ch2_silver']) {
    if (!CHAPTER_LEVEL_BANDS[ch]) {
      issues.push({ severity: 'warn', category: 'progression', message: `章 ${ch} のレベル帯未定義` });
    }
  }

  for (const f of FEATURE_UNLOCKS) {
    if (!f.requiredFlag) issues.push({ severity: 'error', category: 'progression', message: `機能 ${f.feature} に requiredFlag なし` });
  }

  const valhallaTown = db.prepare(`SELECT required_level FROM towns WHERE id = 'valhalla_fortress'`).get() as { required_level: number } | undefined;
  if (valhallaTown && valhallaTown.required_level < 80) {
    issues.push({ severity: 'warn', category: 'progression', message: 'ヴァルハラの required_level が Lv80 未満です' });
  }

  if (!itemIds.has('mat_star_pilgrim_echo')) {
    issues.push({ severity: 'error', category: 'src', message: 'Src化素材 mat_star_pilgrim_echo が存在しません' });
  }

  const sample = db.prepare(`SELECT id, attack, hp, area_tag FROM monsters WHERE id = 'mon_silver_golem'`).get() as {
    attack: number; hp: number;
  } | undefined;
  if (sample && sample.attack < 20) {
    issues.push({ severity: 'warn', category: 'combat', message: '白銀ゴーレムの基礎攻撃力が低すぎる可能性' });
  }

  for (const s of skills) {
    if (!s.element) {
      issues.push({ severity: 'warn', category: 'skill', message: `スキル ${s.name} (${s.id}) に属性未設定` });
    }
  }

  return issues;
}

export function printValidationReport(issues: ValidationIssue[]): void {
  if (!issues.length) {
    console.log('✅ ゲームデータ検証: 問題なし');
    return;
  }
  console.log(`⚠️ ゲームデータ検証: ${issues.length} 件`);
  for (const i of issues) {
    console.log(`[${i.severity.toUpperCase()}] [${i.category}] ${i.message}`);
  }
}
