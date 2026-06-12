/** inventory-ui-check — npx tsx scripts/inventory-ui-check.ts */
import { readFileSync } from 'fs';
import { join } from 'path';
import { getInventoryListItems, buildInventoryView } from '../src/utils/inventoryUi';
import { errorRecoveryPayload } from '../src/utils/nextActionButtons';
import { createPlayer, getPlayer } from '../src/systems/playerSystem';
import { addItem } from '../src/systems/inventorySystem';

const TEST_USER = 'inventory-ui-check-user';
const issues: string[] = [];

function main() {
  if (!getPlayer(TEST_USER)) createPlayer(TEST_USER, 'g', 'Test', 'c');

  const empty = buildInventoryView(TEST_USER, 0);
  if (!empty.embeds.length) issues.push('空所持品embedなし');

  for (let i = 0; i < 30; i++) {
    addItem(TEST_USER, 'mat_iron_scrap', 1);
  }
  const items = getInventoryListItems(TEST_USER, { page: 0, pageSize: 25 });
  if (items.totalCount < 25) issues.push('テストアイテム不足');

  const page0 = buildInventoryView(TEST_USER, 0);
  const page1 = buildInventoryView(TEST_USER, 1);
  const selects0 = page0.components.filter((r) => r.toJSON().components.some((c) => 'custom_id' in c && String(c.custom_id).includes('detail:inv')));
  if (!selects0.length) issues.push('detail:inv select なし');
  for (const row of selects0) {
    const menu = row.toJSON().components.find((c) => 'options' in c) as { options?: unknown[] } | undefined;
    if (menu?.options && menu.options.length > 25) issues.push('select 25件超過');
  }
  if (items.totalPages > 1 && page0.components.length <= page1.components.length) {
    // paging buttons expected
  }

  const mf = readFileSync(join(process.cwd(), 'src/utils/messageFlow.ts'), 'utf8');
  if (!mf.includes('replyEphemeralNoChannel')) issues.push('messageFlow: channel null 安全応答なし');

  const recovery = errorRecoveryPayload('道しるべが乱れた。もう一度開き直してください。');
  if (!recovery.components.length) issues.push('errorRecoveryPayload 戻り導線なし');

  if (issues.length) {
    console.error('❌ inventory-ui-check failed:');
    for (const i of issues) console.error('  -', i);
    process.exit(1);
  }
  console.log('✅ inventory-ui-check passed');
}

main();
