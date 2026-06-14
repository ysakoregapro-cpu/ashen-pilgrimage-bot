# rescue-break-system-audit

Generated: 2026-06-14T14:48:48.753Z

## Summary

- cases: 6
- fails: 0

| case_id | before_break | break_gain | after_break | break_threshold | displayed_break | break_triggered | overflow_clamped_or_reset | match_ok | balance_note |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| normal_fill | 45 | 30 | 75 | 100 | ブレイク 75/100 | NO | NO | OK | normal |
| exact_threshold | 90 | 10 | 0 | 100 | **BREAK中**（強化残2） | YES | YES | OK | normal |
| overflow_640 | 0 | 640 | 0 | 100 | **BREAK中**（強化残2） | YES | YES | OK | normal |
| large_gain | 50 | 200 | 0 | 100 | **BREAK中**（強化残2） | YES | YES | OK | normal |
| already_broken | 640 | 50 | 0 | 100 | **BREAK中**（強化残2） | NO | YES | OK | pre-broken |
| broken_display | 0 | 0 | 0 | 100 | **BREAK中**（強化残2） | NO | YES | OK | pre-broken |