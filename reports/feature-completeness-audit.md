# Feature Completeness Audit

Generated: 2026-06-13T07:37:12.414Z

| id | category | classification | notes |
|---|---|---|---|
| coop:* | handler | handler_without_ui | Handler branch without obvious UI custom_id |
| rescue:* | handler | handler_without_ui | Handler branch without obvious UI custom_id |
| raid:* | handler | handler_without_ui | Handler branch without obvious UI custom_id |
| detail:* | handler | handler_without_ui | Handler branch without obvious UI custom_id |
| job:* | handler | handler_without_ui | Handler branch without obvious UI custom_id |
| coop:join | coop/rescue/raid | implemented_and_reachable | Public channel join fix applied |
| rescue:join | legacy | legacy_leftover | Legacy path — coop:join preferred |
| raid:join | legacy | legacy_leftover | Legacy path — coop:join preferred |
| valhalla | feature_area | needs_manual_test | 43 files reference — manual playtest recommended |
| trial | feature_area | needs_manual_test | 9 files reference — manual playtest recommended |
| upgrade | feature_area | needs_manual_test | 42 files reference — manual playtest recommended |
| repair | feature_area | needs_manual_test | 18 files reference — manual playtest recommended |
| awaken | feature_area | needs_manual_test | 22 files reference — manual playtest recommended |
| kai | feature_area | needs_manual_test | 20 files reference — manual playtest recommended |
| shop | feature_area | needs_manual_test | 19 files reference — manual playtest recommended |
| explore | feature_area | needs_manual_test | 30 files reference — manual playtest recommended |
| equip | feature_area | needs_manual_test | 59 files reference — manual playtest recommended |
| inventory | feature_area | needs_manual_test | 49 files reference — manual playtest recommended |

## Summary
- Total entries: 18
- ui_without_handler: 0
- handler_without_ui: 5
- legacy_leftover: 2