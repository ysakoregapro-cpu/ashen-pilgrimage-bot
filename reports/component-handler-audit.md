# Component Handler Audit

Generated: 2026-06-13T07:37:14.581Z

Coop recruit duplicate custom_ids after sanitize: 0

| custom_id | handler | classification | notes |
|---|---|---|---|
| coop:join:mqc1lnbk_85kopt7s | index.ts:coop | implemented_and_reachable | coop recruit join — handleCoopRecruitButton |
| coop:leave:mqc1lnbk_85kopt7s | index.ts:coop | implemented_and_reachable |  |
| coop:start:mqc1lnbk_85kopt7s | index.ts:coop | implemented_and_reachable |  |
| coop:cancel:mqc1lnbk_85kopt7s | index.ts:coop | implemented_and_reachable |  |
| coop:join:sample | index.ts:coop | implemented_and_reachable | coop recruit join — handleCoopRecruitButton |
| coop:leave:sample | index.ts:coop | implemented_and_reachable |  |
| coop:start:sample | index.ts:coop | implemented_and_reachable |  |
| coop:cancel:sample | index.ts:coop | implemented_and_reachable |  |
| job:trial:list | index.ts:job | implemented_and_reachable |  |
| job:trial:start:剣士 | index.ts:job | implemented_and_reachable |  |
| equip:confirm:1 | index.ts:equip | implemented_and_reachable |  |
| upgrade:confirm:1:2 | index.ts:upgrade | implemented_and_reachable |  |
| shop:confirm_buy:1 | index.ts:shop | implemented_and_reachable |  |
| flow:town | — | ui_without_handler |  |
| nav:back:panel | — | ui_without_handler |  |

## coop join button
- join disabled on public active recruit: NO (good)