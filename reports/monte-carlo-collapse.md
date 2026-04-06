# Monte Carlo Playtest Report

Strategy: `collapse`
Runs per role/difficulty: `25`

| Mode | Difficulty | Win Rate | Avg Days | Common Fail Reasons | Dominant Actions |
| --- | --- | --- | --- | --- | --- |
| planner | easy | 0% | 21.5 | Cabinet window closed before approval (18)<br>Lost political support (7) | Timber Assessment (981)<br>Check Email (952) |
| planner | normal | 0% | 18.3 | Lost political support (18)<br>Cabinet window closed before approval (7) | Timber Assessment (844)<br>Check Email (796) |
| planner | hard | 0% | 15.2 | Lost political support (24)<br>Budget exhausted (1) | Timber Assessment (697)<br>Check Email (656) |
| permitter | easy | 0% | 20.2 | Lost political support - removed from position (19)<br>Failed to meet deadline (6) | Handle Crisis (417)<br>Stakeholder Meeting (83)<br>Take a Break (20)<br>Team Building (2) |
| permitter | normal | 0% | 18.1 | Lost political support - removed from position (17)<br>Budget exhausted (5)<br>Failed to meet deadline (3) | Handle Crisis (364)<br>Stakeholder Meeting (82)<br>Take a Break (13)<br>Team Building (7) |
| permitter | hard | 0% | 14.6 | Lost political support - removed from position (22)<br>Failed to meet deadline (2)<br>Budget exhausted (1) | Handle Crisis (281)<br>Stakeholder Meeting (87)<br>Take a Break (18) |
| recce | easy | 100% | 10.5 | None | Max Effort (130)<br>Rest & End Shift (130) |
| recce | normal | 100% | 11.7 | None | Max Effort (146)<br>Rest & End Shift (146) |
| recce | hard | 84% | 10.9 | OUT OF FUEL - The crew is stranded. (2)<br>ALL CREW LOST - No one remains to continue the journey. (2) | Max Effort (135)<br>Rest & End Shift (135) |
| silviculture | easy | 0% | 38.8 | Budget exhausted (25) | Contractor Meeting (3976)<br>Herbicide Application (487)<br>Team Briefing (192) |
| silviculture | normal | 0% | 29.4 | Budget exhausted (25) | Contractor Meeting (2882)<br>Herbicide Application (450)<br>Team Briefing (176) |
| silviculture | hard | 0% | 18.2 | Budget exhausted (25) | Contractor Meeting (1513)<br>Herbicide Application (442)<br>Team Briefing (158) |

## Sample Failure Seeds

- `planner/easy/seed-7000`: Lost political support
- `planner/easy/seed-7001`: Cabinet window closed before approval
- `planner/easy/seed-7002`: Lost political support
- `planner/easy/seed-7003`: Lost political support
- `planner/easy/seed-7004`: Cabinet window closed before approval
- `planner/easy/seed-7005`: Lost political support
- `planner/easy/seed-7006`: Cabinet window closed before approval
- `planner/easy/seed-7007`: Cabinet window closed before approval
- `planner/easy/seed-7008`: Cabinet window closed before approval
- `planner/easy/seed-7009`: Cabinet window closed before approval
- `planner/easy/seed-7010`: Cabinet window closed before approval
- `planner/easy/seed-7011`: Cabinet window closed before approval
