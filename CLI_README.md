# BC Forestry Simulator - CLI Tools

This directory contains command-line tools for testing and playing the BC Forestry Simulator.

## Available Tools

### 1. Interactive Play-through Tool (`play.mjs`)

A fully interactive CLI version of the game where you can play through an entire year of forestry operations.

**Usage:**
```bash
node play.mjs
# or if executable:
./play.mjs
```

**Features:**
- Full color terminal output
- Interactive role and area selection
- Real-time metric display
- Complete game mechanics including:
  - Regular tasks
  - Field issues
  - Wildcard options (illegal acts)
  - Risk plays with dynamic odds
  - Year-end summary and achievements

**How to Play:**
1. Run the script
2. Choose your forester specialization (1-4)
3. Select an operating area (1-6)
4. Name your forestry crew
5. Make decisions for each task and issue
6. Review your year-end performance

**Controls:**
- Enter number (1-9) to select options
- Follow the prompts to progress through the game

---

### 2. Automated Testing Tool (`cli.mjs`)

A headless automation tool for batch testing game scenarios.

**Usage:**
```bash
# Run a single game with random role/area
node cli.mjs

# Run 10 games with random combinations
node cli.mjs --runs 10

# Test a specific role and area
node cli.mjs --role planner --area fort-st-john-plateau

# Run with detailed logging
node cli.mjs --runs 5 --log

# Custom number of rounds
node cli.mjs --rounds 4 --log
```

**Parameters:**
- `--runs <number>`: Number of game runs to execute (default: 1)
- `--rounds <number>`: Number of seasons to play (default: 4)
- `--role <roleId>`: Specific role to test (see Role IDs below)
- `--area <areaId>`: Specific area to test (see Area IDs below)
- `--log`: Include detailed decision history in output

**Available Role IDs:**
- `planner` - Strategic Planner
- `permitter` - Permitting Specialist
- `recce` - Recon Crew Lead
- `silviculture` - Silviculture Supervisor

**Available Area IDs:**
- `fort-st-john-plateau` - Fort St. John Plateau
- `muskwa-foothills` - Muskwa Foothills
- `bulkley-valley` - Bulkley Valley
- `fraser-plateau` - Fraser Plateau
- `skeena-nass` - Skeena-Nass
- `tahltan-highland` - Tahltan Highland

**Example Outputs:**
```bash
# Quick test of all role/area combinations
for role in planner permitter recce silviculture; do
  for area in fort-st-john-plateau muskwa-foothills bulkley-valley; do
    echo "Testing $role in $area"
    node cli.mjs --role $role --area $area
  done
done
```

---

## Game Mechanics (CLI Version)

Both CLI tools implement the full game mechanics:

### Metrics Tracked
- **Operational Progress** (0-100): Task completion and productivity
- **Forest Health** (0-100): Ecological outcomes
- **Relationships** (0-100): Trust with Indigenous partners and communities
- **Compliance** (0-100): Regulatory adherence
- **Budget Flexibility** (0-100): Financial reserves

### Decision Types

1. **Regular Tasks**: Role-specific decisions (3 per season)
2. **Field Issues**: Procedurally-drawn challenges based on context
3. **Wildcard Options**: Satirical illegal shortcuts with random severity
4. **Risk Plays**: Gambles with dynamic success odds based on current metrics

### Season Flow

Each of the 4 seasons follows this pattern:
```
1. Display current metrics
2. Present 3 role-specific tasks
3. Draw and resolve 1 contextual issue
4. Generate season headline based on biggest metric change
5. Advance to next season
```

### Scoring

Performance is evaluated based on:
- Weighted average of all metrics
- Individual metric thresholds (30, 50, 70)
- Trend analysis over the year
- Earned achievements

**Performance Bands:**
- 75+: Outstanding season
- 60-74: Solid performance
- 45-59: Mixed outcomes
- <45: Operations stumbled

---

## Testing Strategies

### Find Edge Cases
```bash
# Run 50 games to find rare issues
node cli.mjs --runs 50 --log > test_results.txt
```

### Test Specific Scenarios
```bash
# Test permitting in high-compliance areas
node cli.mjs --role permitter --area muskwa-foothills --runs 10
```

### Validate Game Balance
```bash
# Test all combinations
./test_strategies.js
```

---

## Troubleshooting

### Issue: "Invalid role or area supplied"
- Check that you're using the correct role/area IDs (see lists above)
- IDs are case-sensitive and use hyphens, not spaces

### Issue: Game hangs in interactive mode
- Press Ctrl+C to exit
- Check that you're entering valid numbers when prompted
- Ensure your terminal supports color codes

### Issue: Colors not displaying
- Use a terminal that supports ANSI color codes
- On Windows, use Windows Terminal or enable ANSI support

---

## Development Notes

### Adding New Tests

To add new automated test scenarios, modify `test_strategies.js` or create a new script using `cli.mjs` as a template.

### Decision AI

The automated CLI uses a simple scoring algorithm:
```javascript
weights = {
  progress: 1,
  forestHealth: 1.2,
  relationships: 1.1,
  compliance: 1.3,
  budget: 0.8,
}
```

This slightly favors compliance and forestHealth, simulating a conservative operator.

### Extending the Interactive CLI

The `play.mjs` file can be modified to:
- Add save/load functionality
- Implement different difficulty levels
- Add more detailed statistics tracking
- Create custom scenarios

---

## Web Version

For the full browser-based experience with UI, open `index.html` in a modern web browser.

The web version includes:
- Visual terminal interface
- Animated metric displays
- Glossary of forestry terms
- Mobile-responsive design
- Keyboard shortcuts
- Status panel with real-time updates

---

## License

Part of the BC Forestry Simulator project.
