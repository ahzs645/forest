# Monte Carlo Playtest Report

Strategy: `balanced`
Runs per role/difficulty: `25`

| Mode | Difficulty | Win Rate | Avg Days | Common Fail Reasons | Dominant Actions |
| --- | --- | --- | --- | --- | --- |
| planner | easy | 100% | 16.6 | None | Network (216)<br>Gather Data (215)<br>Run Analysis (157)<br>Prepare Submission (102)<br>Take a Break (88) |
| planner | normal | 88% | 17.1 | Cabinet window closed before approval (3) | Gather Data (217)<br>Network (210)<br>Run Analysis (144)<br>Prepare Submission (84)<br>Take a Break (64) |
| planner | hard | 16% | 18.1 | Cabinet window closed before approval (17)<br>Budget exhausted (4) | Values Workshop (289)<br>Gather Data (200)<br>Network (166)<br>Run Analysis (61)<br>Check Email (45) |
| permitter | easy | 72% | 26 | Failed to meet deadline (7) | Address Revisions (715)<br>Take a Break (408)<br>Process Permits (269)<br>Draft Permit Application (200)<br>Submit Permit (200) |
| permitter | normal | 76% | 26.4 | Failed to meet deadline (6) | Address Revisions (743)<br>Take a Break (377)<br>Process Permits (238)<br>Draft Permit Application (200)<br>Submit Permit (200) |
| permitter | hard | 48% | 28.5 | Failed to meet deadline (13) | Address Revisions (830)<br>Take a Break (364)<br>Draft Permit Application (200)<br>Submit Permit (200)<br>Process Permits (179) |
| recce | easy | 100% | 18.1 | None | Scout Ahead (527)<br>Standard Recon (427)<br>Resupply (196)<br>Triage (116)<br>Forage & Hunt (66) |
| recce | normal | 100% | 16.5 | None | Scout Ahead (466)<br>Standard Recon (386)<br>Resupply (178)<br>Triage (82)<br>Forage & Hunt (66) |
| recce | hard | 100% | 16.9 | None | Scout Ahead (447)<br>Standard Recon (384)<br>Resupply (182)<br>Triage (80)<br>Forage & Hunt (72) |
| silviculture | easy | 100% | 10.7 | None | Deploy Planting Crew (378)<br>Conduct Survey (208)<br>Contractor Meeting (169)<br>End Day (40)<br>Herbicide Application (32) |
| silviculture | normal | 100% | 10.8 | None | Deploy Planting Crew (379)<br>Conduct Survey (225)<br>Contractor Meeting (166)<br>End Day (40)<br>Team Briefing (30) |
| silviculture | hard | 100% | 11.2 | None | Deploy Planting Crew (377)<br>Conduct Survey (254)<br>Contractor Meeting (170)<br>End Day (50)<br>Team Briefing (27) |

## Sample Failure Seeds

- `planner/normal/seed-7028`: Cabinet window closed before approval
- `planner/normal/seed-7035`: Cabinet window closed before approval
- `planner/normal/seed-7048`: Cabinet window closed before approval
- `planner/hard/seed-7050`: Budget exhausted
- `planner/hard/seed-7051`: Cabinet window closed before approval
- `planner/hard/seed-7052`: Cabinet window closed before approval
- `planner/hard/seed-7053`: Cabinet window closed before approval
- `planner/hard/seed-7054`: Cabinet window closed before approval
- `planner/hard/seed-7056`: Cabinet window closed before approval
- `planner/hard/seed-7057`: Cabinet window closed before approval
- `planner/hard/seed-7058`: Cabinet window closed before approval
- `planner/hard/seed-7059`: Cabinet window closed before approval
