/** ui-flow-check — npx tsx scripts/ui-flow-check.ts */
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import {
  collectPostActionButtonSpecs,
  collectPostActionButtonIds,
  type NextActionContext,
} from '../src/utils/nextActionButtons';

const ROOT = join(__dirname, '..');
const SRC = join(ROOT, 'src');

function readSrc(rel: string): string {
  return readFileSync(join(ROOT, rel), 'utf8');
}

function assert(cond: boolean, msg: string, issues: string[]) {
  if (!cond) issues.push(msg);
}

function walkTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walkTsFiles(p));
    else if (name.endsWith('.ts') && !name.endsWith('.d.ts')) out.push(p);
  }
  return out;
}

/** setLabel('...もう一度...') / btn(..., '...もう一度...') を列挙 */
function scanMouIchidoLabels(): Array<{ file: string; label: string; line: number }> {
  const hits: Array<{ file: string; label: string; line: number }> = [];
  const re = /(?:setLabel|btn\([^,]+,\s*)['"]([^'"]*もう一度[^'"]*)['"]/g;
  for (const file of walkTsFiles(SRC)) {
    const rel = file.replace(/\\/g, '/').slice(ROOT.replace(/\\/g, '/').length + 1);
    const lines = readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, i) => {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(line))) {
        hits.push({ file: rel, label: m[1]!, line: i + 1 });
      }
    });
  }
  return hits;
}

const ALLOWED_REPEAT_LABELS: Record<string, RegExp> = {
  'もう一度探索': /^explore:repeat:.+/,
  'もう一度再戦': /^rematch:repeat:.+/,
};

const BACK_ID_PREFIXES = [
  'town:', 'flow:', 'prep:back:', 'facility:view:', 'facility:act:',
  'detail:open:', 'town:explore', 'town:home', 'town:npcs', 'town:guide',
  'town:facilities', 'guide:',
];

function main() {
  const issues: string[] = [];
  const indexSrc = readSrc('src/index.ts');
  const uxSrc = readSrc('src/interactions/uxHandler.ts');
  const nextSrc = readSrc('src/utils/nextActionButtons.ts');

  // --- 探索 / 戦闘 ---
  assert(uxSrc.includes('explore:repeat:'), 'uxHandler に explore:repeat ハンドラがない', issues);
  assert(
    indexSrc.includes('buildPostVictory(result.message, isRematch'),
    '戦闘勝利リザルトが rematch / area_id を分岐していない',
    issues,
  );
  assert(
    indexSrc.includes("action === 'inv'"),
    'index handleSelect に detail:inv ハンドラがない',
    issues,
  );

  const exploreSpecs = collectPostActionButtonSpecs('explore_result', { areaId: 'area_test_field' });
  assert(
    exploreSpecs.some((b) => b.id === 'explore:repeat:area_test_field' && b.label === 'もう一度探索'),
    'explore:repeat が areaId を保持していない',
    issues,
  );
  assert(
    exploreSpecs.some((b) => b.id === 'town:explore' && b.label === '探索先を選ぶ'),
    '探索リザルトに「探索先を選ぶ」がない',
    issues,
  );

  const victorySpecs = collectPostActionButtonSpecs('victory', { areaId: 'area_mist_path' });
  assert(
    victorySpecs.some((b) => b.id === 'explore:repeat:area_mist_path'),
    '戦闘勝利リザルトの explore:repeat が areaId を保持していない',
    issues,
  );

  const rematchSpecs = collectPostActionButtonSpecs('boss_rematch_done', { monsterId: 'mon_test', facilityId: 'f_guild' });
  assert(
    rematchSpecs.some((b) => b.id === 'rematch:repeat:mon_test' && b.label === 'もう一度再戦'),
    'ボス再戦後に rematch:repeat がない',
    issues,
  );
  assert(uxSrc.includes('rematch:repeat:'), 'uxHandler に rematch:repeat ハンドラがない', issues);

  // --- 装備 / 詳細 ---
  assert(
    !collectPostActionButtonSpecs('equip_done', { slot: 'weapon' }).some((b) => b.label.includes('もう一度')),
    '装備変更完了後に「もう一度」が残っている',
    issues,
  );
  assert(
    collectPostActionButtonIds('equip_done', { slot: 'weapon' }).includes('prep:back:slots'),
    '装備変更完了後に「装備変更に戻る」がない',
    issues,
  );
  assert(
    !collectPostActionButtonSpecs('item_detail', { detailContext: 'inventory' }).some((b) => b.label.includes('もう一度')),
    'アイテム詳細に「もう一度」が残っている',
    issues,
  );

  // --- ショップ / 工房 ---
  assert(uxSrc.includes('shop:repeat_buy:'), 'uxHandler に shop:repeat_buy ハンドラがない', issues);
  assert(uxSrc.includes('upgrade:repeat:'), 'uxHandler に upgrade:repeat ハンドラがない', issues);
  const shopSpecs = collectPostActionButtonSpecs('shop_buy_done', { facilityId: 'f_shop', itemId: 'pot_hp', qty: 3 });
  assert(
    shopSpecs.some((b) => b.id === 'shop:repeat_buy:pot_hp:3' && b.label === '同じ品を購入'),
    'shop_buy_done に同じ品を購入がない',
    issues,
  );
  const upgradeSpecs = collectPostActionButtonSpecs('upgrade_done', {
    facilityId: 'f_repair', inventoryId: 42, upgradeAction: 'enhance',
  });
  assert(
    upgradeSpecs.some((b) => b.id === 'upgrade:repeat:enhance:42'),
    'upgrade_done に同じ装備を強化がない',
    issues,
  );
  assert(
    !upgradeSpecs.some((b) => b.label.includes('もう一度')),
    'upgrade_done に曖昧な「もう一度」がある',
    issues,
  );

  // --- 重複 custom_id ---
  const contexts: NextActionContext[] = [
    'explore_result', 'victory', 'equip_done', 'item_detail', 'inventory',
    'shop_buy_done', 'shop_sell_done', 'upgrade_done', 'market_done', 'boss_rematch_done',
  ];
  for (const ctx of contexts) {
    const extra = ctx === 'explore_result' || ctx === 'victory'
      ? { areaId: 'area_x' }
      : ctx === 'equip_done'
        ? { slot: 'weapon' }
        : ctx === 'item_detail'
          ? { detailContext: 'inventory' as const }
          : ctx === 'shop_buy_done'
            ? { facilityId: 'f_s', itemId: 'i', qty: 1 }
            : ctx === 'shop_sell_done' || ctx === 'market_done' || ctx === 'upgrade_done'
              ? { facilityId: 'f_s', inventoryId: 1, upgradeAction: 'enhance' as const }
              : ctx === 'boss_rematch_done'
                ? { facilityId: 'f_g', monsterId: 'm' }
                : undefined;
    const ids = collectPostActionButtonIds(ctx, extra);
    const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
    assert(dupes.length === 0, `${ctx} に重複 custom_id: ${[...new Set(dupes)].join(', ')}`, issues);
  }

  // --- 全ソースの「もう一度」ラベル監査 ---
  const mouIchido = scanMouIchidoLabels();
  console.log('「もう一度」ラベル一覧:');
  for (const hit of mouIchido) {
    console.log(`  - ${hit.file}:${hit.line} "${hit.label}"`);
  }

  for (const hit of mouIchido) {
    const specs = collectPostActionButtonSpecs('explore_result', { areaId: 'x' })
      .concat(collectPostActionButtonSpecs('boss_rematch_done', { monsterId: 'x', facilityId: 'f' }));
    const allowedPattern = ALLOWED_REPEAT_LABELS[hit.label];
    if (allowedPattern) {
      const matchingContext = hit.label === 'もう一度探索' ? 'explore_result' : 'boss_rematch_done';
      const extra = hit.label === 'もう一度探索'
        ? { areaId: 'probe_area' }
        : { monsterId: 'probe_mon', facilityId: 'f' };
      const btnSpec = collectPostActionButtonSpecs(matchingContext, extra)
        .find((b) => b.label === hit.label);
      assert(!!btnSpec && allowedPattern.test(btnSpec.id), `${hit.file}:${hit.line} "${hit.label}" の custom_id が repeat 系ではない (${btnSpec?.id})`, issues);
      continue;
    }
    assert(false, `${hit.file}:${hit.line} に許可されていない「もう一度」ラベル: "${hit.label}"`, issues);
  }

  // back 系 id に「もう一度」が付いていないこと（nextActionButtons 定義内）
  for (const ctx of contexts) {
    const extra = { areaId: 'a', facilityId: 'f', monsterId: 'm', itemId: 'i', qty: 1, slot: 'weapon', inventoryId: 1, upgradeAction: 'enhance' as const, detailContext: 'inventory' as const };
    for (const { id, label } of collectPostActionButtonSpecs(ctx, extra)) {
      if (!label.includes('もう一度')) continue;
      const isRepeat = /^explore:repeat:|^rematch:repeat:/.test(id);
      assert(isRepeat, `back/非repeat id "${id}" に「もう一度」ラベル "${label}" (${ctx})`, issues);
      for (const prefix of BACK_ID_PREFIXES) {
        if (id.startsWith(prefix) && label.includes('もう一度')) {
          assert(false, `back 系 id "${id}" に「もう一度」ラベル (${ctx})`, issues);
        }
      }
    }
  }

  if (issues.length) {
    console.error('\nui-flow-check FAILED:');
    for (const i of issues) console.error(`  - ${i}`);
    process.exit(1);
  }
  console.log('\nui-flow-check OK');
}

main();
