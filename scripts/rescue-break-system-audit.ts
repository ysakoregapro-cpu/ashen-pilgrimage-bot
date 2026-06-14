/** rescue-break-system-audit.ts */
import { simulateCoopBreakGain } from '../src/systems/coop/coopBattleSystem';
import { emptyResult, exitCheckResult, writeMdCsvPair } from './balance/balanceHelpers';

const HEADERS = [
  'case_id', 'before_break', 'break_gain', 'after_break', 'break_threshold',
  'displayed_break', 'break_triggered', 'overflow_clamped_or_reset', 'match_ok', 'balance_note',
];

function main() {
  const result = emptyResult();
  const rows: string[][] = [];

  const cases: Array<{ id: string; before: number; gain: number; max: number; broken: boolean }> = [
    { id: 'normal_fill', before: 45, gain: 30, max: 100, broken: false },
    { id: 'exact_threshold', before: 90, gain: 10, max: 100, broken: false },
    { id: 'overflow_640', before: 0, gain: 640, max: 100, broken: false },
    { id: 'large_gain', before: 50, gain: 200, max: 100, broken: false },
    { id: 'already_broken', before: 640, gain: 50, max: 100, broken: true },
    { id: 'broken_display', before: 0, gain: 0, max: 100, broken: true },
  ];

  for (const c of cases) {
    const sim = simulateCoopBreakGain(c.before, c.max, c.gain, c.broken);
    const badDisplay = /\d+\/\d+/.test(sim.displayedBreak)
      && Number(sim.displayedBreak.match(/(\d+)\/\d+/)?.[1] ?? 0) > c.max;
    const ok = !badDisplay
      && (c.id !== 'overflow_640' || sim.breakTriggered)
      && (c.id !== 'already_broken' || sim.displayedBreak.includes('BREAK'))
      && (c.id !== 'broken_display' || sim.displayedBreak.includes('BREAK'));

    if (c.id === 'overflow_640' && !sim.breakTriggered) {
      result.fails.push('640 gain did not trigger break');
    }
    if (c.id === 'overflow_640' && badDisplay) {
      result.fails.push('640/100 display still possible');
    }
    if (c.id === 'already_broken' && sim.afterBreak > c.max) {
      result.fails.push('break accumulates during BREAK state');
    }

    rows.push([
      c.id,
      String(sim.beforeBreak),
      String(sim.breakGain),
      String(sim.afterBreak),
      String(sim.breakThreshold),
      sim.displayedBreak.replace(/\n/g, ' '),
      sim.breakTriggered ? 'YES' : 'NO',
      sim.overflowClampedOrReset ? 'YES' : 'NO',
      ok ? 'OK' : 'FAIL',
      c.broken ? 'pre-broken' : 'normal',
    ]);
  }

  writeMdCsvPair('rescue-break-system-audit', HEADERS, rows, [
    '## Summary', '', `- cases: ${rows.length}`, `- fails: ${result.fails.length}`,
  ]);
  exitCheckResult('rescue-break-system-audit', result);
}

main();
