# equipment-menu-pagination-audit

Generated: 2026-06-14T13:51:03.570Z

- screens: 4

| screen_id | screen_name | owned_count | has_pagination | can_reach_page_2 | can_select_page_2_item | keeps_action_context | has_back_button | has_town_button | duplicate_custom_id | balance_note |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| upgrade_awaken | 覚醒対象選択 | 30 | YES | YES | YES | YES | YES | YES | NO | paged mock 30 items |
| upgrade_enhance | 武器強化選択 | 30 | YES | YES | YES | YES | YES | YES | NO | paged mock 30 items |
| equip_change | 装備変更 | 24+ if owned | YES | YES | YES | YES | YES | YES | NO | buildEquipSlotSelectView paging (EQUIP_SELECT_PAGE_SIZE=24) |
| detail_pick | 品の詳細選択 | dynamic | WARN | WARN | N/A | NO | NO | YES | NO | uses inventory list paging |