import { useEffect, useRef, useState } from "react";

import { useGameFlow } from "../../tui/useGameFlow";
import { renderMapsciiFrame } from "../../js/scene/mapscii/index.js";

// Findings are authored as sentence fragments ("peatland edges, ..."), which
// read fine mid-sentence but look wrong when they lead a line. Capitalize the
// first letter for standalone display without touching the source data.
function leadCapitalize(text) {
  const str = String(text ?? "");
  return str.replace(/^(\s*)(\p{L})/u, (_, space, letter) => space + letter.toUpperCase());
}

function toKeyInput(domEvent) {
  const map = {
    ArrowUp: "up",
    ArrowDown: "down",
    Enter: "return",
    Backspace: "backspace",
    Escape: "escape",
  };

  const printable = domEvent.key.length === 1 ? domEvent.key : undefined;
  return {
    ctrl: domEvent.ctrlKey,
    meta: domEvent.metaKey,
    name: map[domEvent.key] ?? domEvent.key.toLowerCase(),
    sequence: printable,
  };
}

function Header({ onExit, isCrisis }) {
  return (
    <header className="tui-header">
      <div className="tui-header-title">
        <span className="tui-header-brand">{isCrisis ? "BC Forestry Simulator" : "BC Forestry Trail"}</span>
        <span className="tui-header-tag">{isCrisis ? "Incident command TUI" : "Seasonal Strategy TUI"}</span>
      </div>
      <div className="tui-header-actions">
        <button type="button" className="tui-header-button" onClick={onExit}>
          ← Main Menu
        </button>
        <div className="tui-header-help">Press Q to return to the main menu</div>
      </div>
    </header>
  );
}

function AreaBriefing({ briefing, areaName }) {
  const finds = briefing?.likelyFinds || [];
  const signals = briefing?.seasonalSignals || [];
  return (
    <div className="tui-dashboard-body tui-area-briefing">
      {areaName ? <div className="tui-heading">{areaName}</div> : null}
      {briefing?.zoneSummary ? <p className="tui-copy dim preserve">{briefing.zoneSummary}</p> : null}
      {finds.length ? (
        <>
          <div className="tui-subheading">What you'll likely hit</div>
          <ul className="tui-area-list">
            {finds.map((find, idx) => (
              <li className="tui-copy preserve" key={`find-${idx}`}>{find}</li>
            ))}
          </ul>
        </>
      ) : null}
      {signals.length ? (
        <>
          <div className="tui-subheading">Seasonal signals</div>
          <ul className="tui-area-list">
            {signals.map((signal, idx) => (
              <li className="tui-copy dim preserve" key={`signal-${idx}`}>{signal}</li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}

const METRIC_ROWS = [
  { key: "progress", label: "Progress", tone: "yellow", color: "#d29922" },
  { key: "forestHealth", label: "Forest Health", tone: "green", color: "#3fb950" },
  { key: "relationships", label: "Relationships", tone: "blue", color: "#58a6ff" },
  { key: "compliance", label: "Compliance", tone: "magenta", color: "#bc8cff" },
  { key: "budget", label: "Budget", tone: "red", color: "#f85149" },
];

// Five percentages are hard to scan, so each meter draws a proportional bar and
// surfaces the swing from the player's most recent choice as an arrow.
function MetricBar({ label, value, tone, color, delta }) {
  const pct = Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
  const change = Math.round(Number(delta) || 0);
  return (
    <div className="tui-metric">
      <div className="tui-metric-head">
        <span className="tui-metric-label">{label}</span>
        <span className="tui-metric-figs">
          <span className={`tui-metric-value tone-${tone}`}>{pct}%</span>
          {change !== 0 ? (
            <span className={`tui-metric-delta ${change > 0 ? "tone-green" : "tone-red"}`}>
              {change > 0 ? `▲ +${change}` : `▼ ${change}`}
            </span>
          ) : null}
        </span>
      </div>
      <div className="tui-metric-track">
        <div className="tui-metric-fill" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

// Short keys for the cramped mobile strip, where five spelled-out labels won't
// fit on one row.
const METRIC_SHORT = {
  progress: "P",
  forestHealth: "FH",
  relationships: "R",
  compliance: "C",
  budget: "B",
};

// Mobile-only sticky strip so the five meters stay in view while the player
// reads options — on phones the full dashboard sits below the fold. Hidden on
// desktop (the dashboard is always visible there) and aria-hidden because the
// dashboard already exposes these values to assistive tech.
function MobileMetricStrip({ gameState }) {
  if (!gameState?.metrics) return null;
  const deltas = gameState.lastChoiceEffects || {};
  return (
    <div className="tui-mobile-metrics" aria-hidden="true">
      {METRIC_ROWS.map((row) => {
        const value = Math.max(0, Math.min(100, Math.round(Number(gameState.metrics[row.key]) || 0)));
        const change = Math.round(Number(deltas[row.key]) || 0);
        return (
          <span className="tui-mobile-metric" key={row.key}>
            <span className="tui-mobile-metric-key">{METRIC_SHORT[row.key] || row.label}</span>
            <span className={`tui-mobile-metric-val tone-${row.tone}`}>{value}</span>
            {change !== 0 ? (
              <span className={`tui-mobile-metric-delta ${change > 0 ? "tone-green" : "tone-red"}`}>
                {change > 0 ? `▲${change}` : `▼${Math.abs(change)}`}
              </span>
            ) : null}
          </span>
        );
      })}
    </div>
  );
}

// Persistent "here's what your last call did" panel. The transient outcome
// notice scrolls away with the next card; this keeps the chosen option and its
// metric swing in view so the loop reads as choice → consequence → next choice.
function LastDecisionPanel({ decision }) {
  if (!decision?.label) return null;
  const resultTone = decision.success === true ? "green" : decision.success === false ? "red" : null;
  const resultWord = decision.success === true ? "Success" : decision.success === false ? "Caught" : null;
  return (
    <section className="tui-panel tui-last-decision" aria-label="Last decision">
      <div className="tui-panel-title">Last Decision</div>
      <div className="tui-last-decision-body">
        <p className="tui-copy">
          <span className="tui-last-decision-key">You chose</span>
          <span className="tui-last-decision-choice">{decision.label}</span>
          {resultWord ? <span className={`tui-last-decision-result tone-${resultTone}`}>{resultWord}</span> : null}
        </p>
        {decision.outcome ? <p className="tui-copy dim preserve">{decision.outcome}</p> : null}
        {decision.effectText ? (
          <p className="tui-copy">
            <span className="tui-last-decision-key">Effects</span>
            <span className="tui-last-decision-effects">{decision.effectText}</span>
          </p>
        ) : (
          <p className="tui-copy dim">
            <span className="tui-last-decision-key">Effects</span>
            <span>No measurable change.</span>
          </p>
        )}
      </div>
    </section>
  );
}

function shortSeason(season) {
  return String(season || "").split(" ")[0] || season;
}

function ObjectiveReadout({ objective, crisisObjective, strip }) {
  const active = crisisObjective || objective;
  if (!active) return null;
  return (
    <div className="tui-dashboard-aside tui-objective">
      <div className="tui-dashboard-section-title">Your mandate</div>
      <p className="tui-copy">{active.mandate}</p>
      {active.signatureWin ? (
        <p className="tui-copy dim">{`Win: ${active.signatureWin}.`}</p>
      ) : null}
      {strip ? (
        <p className="tui-copy dim">{`Right now: ${strip.pressure}`}</p>
      ) : null}
    </div>
  );
}

function StyleReadout({ style }) {
  if (!style || !style.total) return null;
  return (
    <div className="tui-dashboard-aside">
      <div className="tui-dashboard-section-title">Management style</div>
      <div className="tui-style-label tone-green">{style.label}</div>
      <p className="tui-copy dim">{style.tendency}</p>
    </div>
  );
}

function SeasonLog({ timeline }) {
  if (!timeline?.length) return null;
  return (
    <div className="tui-dashboard-aside">
      <div className="tui-dashboard-section-title">Season log</div>
      {timeline.map((entry) => (
        <div className="tui-season-log-row" key={`season-${entry.round}`}>
          <span className="tui-season-log-season tone-green">{shortSeason(entry.season)}</span>
          <span className="tui-season-log-headline">{entry.headline || "—"}</span>
        </div>
      ))}
    </div>
  );
}

// Persistent cause/effect feed: the player's recent calls and the fallout they
// triggered, newest first. Makes the world feel responsive — every line is
// either a choice they made or a consequence it set off.
function DecisionTrail({ trail }) {
  if (!trail?.length) return null;
  return (
    <div className="tui-dashboard-aside tui-decision-trail">
      <div className="tui-dashboard-section-title">Decision trail</div>
      {trail.map((entry, idx) => {
        const isFallout = entry.kind === "fallout";
        const lead = isFallout ? "Fallout" : "You chose";
        const text = isFallout ? entry.title : entry.option || entry.title;
        return (
          <div className="tui-trail-row" key={`trail-${idx}`}>
            <span className={`tui-trail-lead ${isFallout ? "tone-yellow" : "tone-blue"}`}>{lead}</span>
            <span className="tui-trail-text">
              {text}
              {entry.effectText ? <span className="tui-trail-effect dim">{` — ${entry.effectText}`}</span> : null}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function Dashboard({ gameState }) {
  const [tab, setTab] = useState("status");

  const metaRows = !gameState
    ? [{ label: "Status", value: "Awaiting game start..." }]
    : [
        { label: gameState.gameMode === "crisis-command" ? "Phase" : "Season", value: `${gameState.round || 0} / ${gameState.totalRounds || 4}` },
        { label: "Company", value: gameState.companyName },
        { label: "Mode", value: gameState.modeLabel },
        { label: "Incident", value: gameState.crisis?.title },
        { label: "Role", value: gameState.roleDisplayName || gameState.role?.seasonalName || gameState.role?.name },
        { label: "Area", value: gameState.area?.name },
      ].filter((row) => row.value !== undefined && row.value !== null);

  const deltas = gameState?.lastChoiceEffects || {};
  const briefing = gameState?.areaBriefing;
  const hasBriefing = Boolean(
    briefing && (briefing.zoneSummary || briefing.likelyFinds?.length || briefing.seasonalSignals?.length)
  );
  // Fall back to Status whenever there's no area context to show (e.g. setup,
  // or a reset that clears the briefing while the tab was left on "area").
  const activeTab = tab === "area" && hasBriefing ? "area" : "status";

  return (
    <aside className="tui-panel tui-dashboard">
      <div className="tui-panel-title tui-dashboard-tabs">
        <button
          type="button"
          className={`tui-dashboard-tab ${activeTab === "status" ? "active" : ""}`}
          onClick={() => setTab("status")}
        >
          Dashboard
        </button>
        {hasBriefing ? (
          <button
            type="button"
            className={`tui-dashboard-tab ${activeTab === "area" ? "active" : ""}`}
            onClick={() => setTab("area")}
          >
            Area
          </button>
        ) : null}
      </div>
      {activeTab === "area" ? (
        <AreaBriefing briefing={briefing} areaName={gameState?.area?.name} />
      ) : (
        <div className="tui-dashboard-body">
          {gameState ? (
            <div className="tui-metric-list">
              {METRIC_ROWS.map((row) => (
                <MetricBar
                  key={row.key}
                  label={row.label}
                  tone={row.tone}
                  color={row.color}
                  value={gameState.metrics[row.key]}
                  delta={deltas[row.key]}
                />
              ))}
            </div>
          ) : null}
          {metaRows.map((row) => (
            <div className="tui-dashboard-row" key={row.label}>
              <span className="tui-dashboard-label">{row.label}</span>
              <span className="tui-dashboard-value">{row.value}</span>
            </div>
          ))}
          <ObjectiveReadout objective={gameState?.roleObjective} crisisObjective={gameState?.crisisObjective} strip={gameState?.objectiveStrip} />
          <DecisionTrail trail={gameState?.decisionTrail} />
          <StyleReadout style={gameState?.managementStyle} />
          <SeasonLog timeline={gameState?.seasonTimeline} />
        </div>
      )}
    </aside>
  );
}

function NameInput({ inputText, onInputChange, onSubmit }) {
  return (
    <div className="tui-content-stack">
      <div className="tui-heading">Welcome to BC Forestry Trail</div>
      <p className="tui-copy">Enter your Company Name:</p>
      <p className="tui-copy dim">Tap the field to type, or continue with the default &ldquo;Forest Co-op&rdquo;.</p>
      <div className="tui-entry-controls">
        <label className="tui-input-label" htmlFor="company-name">
          Company Name
        </label>
        <div className="tui-entry-row">
          <input
            id="company-name"
            className="tui-text-input"
            type="text"
            value={inputText}
            placeholder="Forest Co-op"
            autoComplete="organization"
            autoCapitalize="words"
            spellCheck="false"
            onChange={(event) => onInputChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                onSubmit();
              }
            }}
          />
          <button type="button" className="tui-action-button" onClick={onSubmit}>
            {inputText.trim() ? "Continue" : "Use Default"}
          </button>
        </div>
      </div>
      <pre className="tui-name-input">{`> ${inputText}█`}</pre>
    </div>
  );
}

function NoticeBlock({ notice }) {
  if (!notice) return null;

  const toneClass =
    {
      info: "blue",
      positive: "green",
      warning: "yellow",
      danger: "red",
    }[notice.tone || "info"] || "blue";

  return (
    <div className={`tui-notice tone-${toneClass}`}>
      <div className="tui-notice-heading">{notice.heading}</div>
      {notice.body ? <p className="tui-copy preserve">{notice.body}</p> : null}
    </div>
  );
}

function SummarySection({ title, items, tone }) {
  if (!items?.length) return null;

  return (
    <>
      <div className="tui-subheading">{title}</div>
      <div className="tui-detail-list">
        {items.map((item) => (
          <div className={`tui-copy preserve ${tone ? `tone-${tone}` : ""}`} key={`${title}-${item}`}>
            {item}
          </div>
        ))}
      </div>
    </>
  );
}

function ScenarioAsciiMap({ map, features }) {
  const [zoom, setZoom] = useState(1);
  const [center, setCenter] = useState({ x: 50, y: 50 });
  const [mode, setMode] = useState("tactical");

  const hasVectorFeatures = Array.isArray(features) && features.length > 0;
  const renderedMap = hasVectorFeatures && mode === "braille"
    ? renderMapsciiFrame(features, {
        width: 116,
        height: 76,
        center,
        zoom,
      })
    : map;

  const move = (dx, dy) => {
    setCenter((current) => ({
      x: Math.max(8, Math.min(92, current.x + dx)),
      y: Math.max(8, Math.min(92, current.y + dy)),
    }));
  };

  const zoomBy = (delta) => {
    setZoom((current) => Math.max(0.85, Math.min(1.55, Number((current + delta).toFixed(2)))));
  };

  const reset = () => {
    setZoom(1);
    setCenter({ x: 50, y: 50 });
  };

  return (
    <div className="tui-map-shell">
      <div className="tui-map-controls" aria-label="ASCII map controls">
        <button type="button" onClick={() => move(0, -5)} title="Pan north">↑</button>
        <button type="button" onClick={() => move(-5, 0)} title="Pan west">←</button>
        <button type="button" onClick={() => move(5, 0)} title="Pan east">→</button>
        <button type="button" onClick={() => move(0, 5)} title="Pan south">↓</button>
        <button type="button" onClick={() => zoomBy(0.1)} title="Zoom in">+</button>
        <button type="button" onClick={() => zoomBy(-0.1)} title="Zoom out">−</button>
        <button type="button" onClick={reset} title="Reset map">Reset</button>
        {hasVectorFeatures ? (
          <button
            type="button"
            className="tui-map-mode-toggle"
            onClick={() => setMode((current) => (current === "tactical" ? "braille" : "tactical"))}
            title="Toggle Braille renderer proof of concept"
          >
            {mode === "tactical" ? "Braille POC" : "Tactical"}
          </button>
        ) : null}
        <span>
          {mode === "braille"
            ? `braille zoom ${Math.round(zoom * 100)}% · center ${Math.round(center.x)},${Math.round(center.y)}`
            : "tactical map"}
        </span>
      </div>
      <div className={`tui-map-viewport ${mode === "tactical" ? "tactical" : "braille"}`}>
        <pre className="tui-scenario-map tui-map-layer">{renderedMap}</pre>
      </div>
      <div className="tui-map-legend">
        {hasVectorFeatures && mode === "braille"
          ? "Braille renderer POC · vector features via browser tile source · roads/water/stands/labels"
          : "x beetle core · ! leading edge · ~ water · = road · H habitat · FN partner values"}
      </div>
    </div>
  );
}

// Top-of-card strip the player reads first: the standing goal, what is at risk
// right now, and the single most pressing pressure. Generated from current
// metrics + role mandate so it always matches the dashboard.
function ObjectiveStrip({ strip }) {
  if (!strip) return null;
  const riskText = strip.risks?.length
    ? strip.risks.map((risk) => risk.label).join(" · ")
    : "All meters stable";
  return (
    <div className="tui-objective-strip">
      <div className="tui-objective-strip-row">
        <span className="tui-objective-strip-key">Goal</span>
        <span className="tui-objective-strip-val">{strip.goal}</span>
      </div>
      <div className="tui-objective-strip-row">
        <span className="tui-objective-strip-key">Current risk</span>
        <span className={`tui-objective-strip-val ${strip.risks?.length ? "tone-yellow" : "tone-green"}`}>{riskText}</span>
      </div>
    </div>
  );
}

// One-screen "what am I trying to do?" card shown alongside the first season's
// opening message, so a new player learns the goal, the loop, and their win
// condition before the first real decision.
function MissionBriefing({ mission }) {
  if (!mission) return null;
  return (
    <section className="tui-mission" aria-label="How to play">
      <div className="tui-mission-title">Your mission</div>
      <div className="tui-mission-row">
        <span className="tui-mission-key tone-green">Goal</span>
        <span className="tui-mission-val">{mission.goal}</span>
      </div>
      {mission.steps?.length ? (
        <div className="tui-mission-row">
          <span className="tui-mission-key tone-blue">How to play</span>
          <ul className="tui-mission-steps">
            {mission.steps.map((step, idx) => (
              <li className="tui-copy" key={`step-${idx}`}>{step}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {mission.mandate ? (
        <div className="tui-mission-row">
          <span className="tui-mission-key tone-magenta">Your role</span>
          <span className="tui-mission-val">{mission.mandate}</span>
        </div>
      ) : null}
      {mission.win ? (
        <div className="tui-mission-row">
          <span className="tui-mission-key tone-yellow">Win</span>
          <span className="tui-mission-val">{mission.win}</span>
        </div>
      ) : null}
    </section>
  );
}

function ContentView({ data, objective }) {
  if (!data) return null;

  if (data.type === "message" || data.type === "confirm" || data.type === "resume") {
    return (
      <div className="tui-content-stack">
        <NoticeBlock notice={data.notice} />
        {data.heading ? <div className="tui-heading">{data.heading}</div> : null}
        {data.body ? <p className="tui-copy preserve">{data.body}</p> : null}
        <MissionBriefing mission={data.mission} />
      </div>
    );
  }

  if (data.type === "setup") {
    return (
      <div className="tui-content-stack">
        <NoticeBlock notice={data.notice} />
        <div className="tui-heading">{data.heading}</div>
        {data.subtitle ? <p className="tui-copy dim">{data.subtitle}</p> : null}
      </div>
    );
  }

  if (data.type === "scenario") {
    return (
      <div className="tui-scenario-console">
        <NoticeBlock notice={data.notice} />
        <div className="tui-scenario-titlebar">
          {data.phaseLabel ? <span className="tui-source-label tone-yellow">{data.phaseLabel}</span> : null}
          <span className="tui-scenario-title">{data.title}</span>
        </div>
        <div className="tui-window-grid">
          <section className="tui-tui-window tui-window-map">
            <div className="tui-window-title">ASCII BLOCK MAP</div>
            <ScenarioAsciiMap map={data.map} features={data.mapFeatures} />
          </section>

          <section className="tui-tui-window tui-window-brief">
            <div className="tui-window-title">BRIEFING</div>
            {data.context?.operation ? (
              <>
                <div className="tui-subheading">Current Operation</div>
                <p className="tui-copy preserve">{data.context.operation}</p>
                {data.context?.objective ? <p className="tui-copy dim preserve">{`Objective: ${data.context.objective}`}</p> : null}
              </>
            ) : null}
            <div className="tui-subheading">What Changed</div>
            <p className="tui-copy preserve">{data.description}</p>
            <div className="tui-subheading">Why Now</div>
            {data.context?.stakes ? <p className="tui-copy preserve">{data.context.stakes}</p> : null}
            {data.whyNow ? <p className="tui-copy dim preserve">{data.whyNow}</p> : null}
          </section>

          <section className="tui-tui-window tui-window-status">
            <div className="tui-window-title">STATUS</div>
            <div className="tui-detail-list">
              {data.weather ? <div className="tui-copy preserve">{`Weather: ${data.weather}`}</div> : null}
              {data.deadline ? <div className="tui-copy preserve">{`Deadline: ${data.deadline}`}</div> : null}
              {Object.entries(data.status || {}).map(([label, value]) => (
                <div className="tui-copy preserve" key={label}>{`${label}: ${value}`}</div>
              ))}
            </div>
          </section>

          <section className="tui-tui-window tui-window-intel">
            <div className="tui-window-title">INTEL FEED</div>
            <div className="tui-detail-list">
              {(data.intelLines || []).map((line, idx) => (
                <p className="tui-copy dim preserve" key={`intel-${idx}`}>{line}</p>
              ))}
            </div>
          </section>

          <section className="tui-tui-window tui-window-actions">
            <div className="tui-window-title">COMMAND FOCUS</div>
            <div className="tui-subheading">What am I deciding?</div>
            <p className="tui-copy preserve">{data.decisionPrompt || "How do you want to respond?"}</p>
            <p className="tui-copy dim preserve">Use the command menu below to select and execute an action.</p>
          </section>
        </div>
      </div>
    );
  }

  if (
    data.type === "assignment"
    || data.type === "task"
    || data.type === "issue"
    || data.type === "event"
    || data.type === "temptation"
  ) {
    return <DecisionCard data={data} objective={objective} />;
  }

  if (data.type === "summary") {
    return (
      <div className="tui-content-stack">
        <NoticeBlock notice={data.notice} />
        <div className="tui-heading">{data.heading}</div>
        {data.tier ? (
          <div className="tui-source-label tone-yellow">
            {`Ending: ${data.tier}`}
            {typeof data.score === "number" ? ` · score ${data.score}/100` : ""}
          </div>
        ) : null}
        <p className="tui-copy preserve">{data.body}</p>
        {data.scoreReasons?.length ? (
          <SummarySection title="Scorecard" items={data.scoreReasons} />
        ) : null}
        {data.style?.total ? (
          <div className="tui-notice tone-green">
            <div className="tui-notice-heading">Management style: {data.style.label}</div>
            <p className="tui-copy">{data.style.tendency}</p>
          </div>
        ) : null}
        {data.roleLens ? <p className="tui-copy preserve tone-blue">{data.roleLens}</p> : null}
        <SummarySection title="Signals" items={data.bullets} />
        <SummarySection title="Key Decisions" items={data.highlights} />
        <SummarySection title="Season Review" items={data.seasonSummaries} />
        <SummarySection title="Trendlines" items={data.trendLines} />
        <SummarySection title="Next Year Outlook" items={data.projection} />
        <SummarySection title="Achievements" items={data.achievements} tone="green" />
      </div>
    );
  }

  return null;
}

function AmbientArt({ art }) {
  const [frameIndex, setFrameIndex] = useState(0);

  useEffect(() => {
    if (!art?.frames?.length || art.frames.length === 1) {
      setFrameIndex(0);
      return undefined;
    }

    setFrameIndex(0);
    const id = window.setInterval(() => {
      setFrameIndex((current) => (current + 1) % art.frames.length);
    }, art.delay);
    return () => window.clearInterval(id);
  }, [art]);

  if (!art?.frames?.length) return null;

  return <pre className="tui-art">{art.frames[frameIndex]}</pre>;
}

// Every seasonal decision card answers the same four questions up front, so the
// player never has to open a panel to understand the choice they're making:
//   1. What job am I doing?   2. What changed?
//   3. Why does it matter now? 4. What am I deciding?
// Each section falls back to sensible copy so the contract holds even when a
// card omits a piece of context.
function DecisionCard({ data, objective }) {
  const job = data.context?.operation || data.sourceLabel || data.cardLabel
    || "This season's fieldwork";
  const changed = leadCapitalize(data.description) || "A new situation needs your call.";
  const whyNow = data.context?.stakes || data.whyNow || data.surfaceReason || data.flavor
    || "How you handle this shapes your standing for the rest of the season.";
  const deciding = data.context?.objective || data.decisionPrompt
    || "Choose the response that best fits your strategy.";

  return (
    <div className="tui-content-stack tui-decision-card">
      <NoticeBlock notice={data.notice} />
      <ObjectiveStrip strip={objective} />
      {data.sourceLabel || data.cardLabel ? (
        <div className="tui-source-label">{data.sourceLabel || data.cardLabel}</div>
      ) : null}
      {data.phaseLabel ? <div className="tui-source-label tone-yellow">{data.phaseLabel}</div> : null}
      <div className="tui-heading">{data.title}</div>
      {data.headline ? <p className="tui-card-headline preserve">{data.headline}</p> : null}

      {data.provenance ? (
        <div className="tui-notice tone-yellow">
          <p className="tui-copy">{data.provenance}</p>
        </div>
      ) : null}

      <div className="tui-subheading">What job am I doing?</div>
      <p className="tui-copy preserve">{job}</p>

      <div className="tui-subheading">What changed?</div>
      <p className="tui-copy preserve">{changed}</p>

      <div className="tui-subheading">Why does it matter now?</div>
      <p className="tui-copy preserve">{whyNow}</p>

      <div className="tui-subheading">What am I deciding?</div>
      <p className="tui-copy preserve">{deciding}</p>
    </div>
  );
}

// Pre-commitment risk band: a quick read on how exposed a choice is, without
// spoiling the outcome. Only attached to real decision options (which carry a
// riskLevel) — setup/confirm/menu options stay tag-free.
const RISK_TAGS = {
  low: { text: "SAFE", className: "tone-green", word: "Safe" },
  medium: { text: "TRADEOFF", className: "tone-yellow", word: "Tradeoff" },
  high: { text: "RISKY", className: "tone-red", word: "Risky" },
};

function OptionsPanel({ options, optionDetails, heading, tone, selected, onSelect, isCrisis }) {
  if (!options.length) return null;

  const toneClass =
    tone === "danger" ? "red" : tone === "warning" ? "yellow" : tone ? "blue" : "";
  const title = heading || (isCrisis ? "Command Menu" : "Options");
  // Only explain the tags when they're actually on screen (decision cards),
  // never on setup/menu lists. New players read "SAFE" as "correct", so spell
  // out that the bands describe exposure, not the right answer.
  const hasRiskTags = (optionDetails || []).some((detail) => detail?.riskLevel);

  return (
    <section className="tui-panel tui-options">
      <div className="tui-panel-title">
        <span className={`tui-options-prompt ${toneClass ? `tone-${toneClass}` : ""}`}>{title}</span>
        <span className="tui-options-hint">↑↓ · Enter · 1–9</span>
      </div>
      <div className="tui-options-list">
        {options.map((label, index) => {
          const detail = optionDetails?.[index];
          // Show the tradeoff hint before commitment — never the full outcome,
          // which lands in the result notice after the choice is made.
          const preview = detail?.preview;
          const sub = preview && preview !== label ? preview : null;
          const riskTag = detail?.riskLevel ? RISK_TAGS[detail.riskLevel] : null;
          const isSelected = index === selected;
          // Decision options get a clean, spoken accessible name ("Option 2:
          // Continue run — Risky"); setup/menu options keep their visible text as
          // their accessible name so existing role-name selectors still resolve.
          const ariaLabel = riskTag
            ? `Option ${index + 1}: ${label} — ${riskTag.word}`
            : detail
              ? `Option ${index + 1}: ${label}`
              : undefined;
          return (
            <button
              key={`${label}-${index}`}
              type="button"
              className={`tui-option ${isSelected ? "selected" : ""}`}
              aria-label={ariaLabel}
              aria-current={isSelected ? "true" : undefined}
              onClick={() => onSelect(index)}
            >
              <span className="tui-option-number" aria-hidden="true">{index + 1}</span>
              <span className="tui-option-body">
                <span className="tui-option-label">{label}</span>
                {sub ? <span className="tui-option-preview">{sub}</span> : null}
              </span>
              {riskTag ? (
                <span className={`tui-option-tag ${riskTag.className}`} aria-hidden="true">{riskTag.text}</span>
              ) : null}
            </button>
          );
        })}
      </div>
      {hasRiskTags ? (
        <p className="tui-options-risk-help">
          Risk tags flag downside, not the best move — SAFE can be slow, RISKY can still pay off.
        </p>
      ) : null}
    </section>
  );
}

function FieldRadio({ mode, inputText, contentData, art, objective, onInputChange, onSubmitName, isCrisis }) {
  return (
    <section className="tui-panel tui-field-radio">
      <div className="tui-panel-title">{isCrisis ? "Scenario Console" : "Field Radio"}</div>
      <div className="tui-field-layout">
        <div className="tui-field-main">
          {mode === "setup-name" ? (
            <NameInput inputText={inputText} onInputChange={onInputChange} onSubmit={onSubmitName} />
          ) : (
            <ContentView data={contentData} objective={objective} />
          )}
        </div>
        {art ? <AmbientArt art={art} /> : null}
      </div>
    </section>
  );
}

export default function App() {
  const {
    controller,
    exitGame,
    selectOption,
    setInputText,
    submitCurrent,
    ...state
  } = useGameFlow({
    onExit: () => window.location.assign("./index.html"),
  });

  useEffect(() => {
    const onKeyDown = (event) => {
      const tag = document.activeElement?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || event.metaKey) return;

      if (
        event.key === "ArrowUp" ||
        event.key === "ArrowDown" ||
        event.key === "Enter" ||
        event.key === "Backspace" ||
        event.key === "Escape" ||
        event.key.length === 1
      ) {
        event.preventDefault();
        controller.handleKey(toKeyInput(event));
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [controller]);

  const isCrisis = state.gameState?.gameMode === "crisis-command";

  // Hub deep-link: tui.html?mode=crisis-command jumps straight into the
  // incident with the default company name.
  const crisisRequested = useRef(
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("mode") === "crisis-command"
  );
  useEffect(() => {
    if (!crisisRequested.current) return;
    if (state.mode === "resume") {
      // Crisis deep-link takes priority over a parked seasonal run: discard the
      // resume prompt (Start a new run) and continue into the crisis flow.
      selectOption(state.options.length - 1);
    } else if (state.mode === "setup-name") {
      controller.handleKey({ name: "return" });
    } else if (state.mode === "setup-role" && state.options.length) {
      crisisRequested.current = false;
      selectOption(state.options.length - 1);
    }
  }, [state.mode, state.options.length, controller, selectOption]);

  return (
    <main className="tui-app-shell">
      <div className="tui-shell">
        <Header onExit={exitGame} isCrisis={isCrisis} />
        <div className="tui-main">
          <Dashboard gameState={state.gameState} />
          <div className="tui-stage">
            <FieldRadio
              isCrisis={isCrisis}
              mode={state.mode}
              inputText={state.inputText}
              contentData={state.contentData}
              art={state.art}
              objective={state.gameState?.objectiveStrip}
              onInputChange={setInputText}
              onSubmitName={submitCurrent}
            />
            {state.animFrame ? (
              <section className="tui-panel tui-overlay">
                <div className="tui-panel-title">Animation</div>
                <pre className="tui-art">{state.animFrame}</pre>
              </section>
            ) : null}
            {state.mode !== "end" ? (
              <LastDecisionPanel decision={state.gameState?.lastDecision} />
            ) : null}
            <MobileMetricStrip gameState={state.gameState} />
            <OptionsPanel
              options={state.options}
              optionDetails={state.contentData?.optionDetails}
              heading={state.contentData?.decisionPrompt || state.contentData?.optionHeading}
              tone={state.contentData?.optionTone}
              selected={state.selected}
              onSelect={selectOption}
              isCrisis={isCrisis}
            />
          </div>
        </div>
        {isCrisis ? (
          <footer className="tui-terminal-footer">
            <span className="tone-green">forest-ops@bc-simulator</span>
            <span>:</span>
            <span className="tone-blue">~/incident-command</span>
            <span>$ run crisis_command --scenario pine-beetle --area fraser-plateau</span>
            <span className="tui-cursor" aria-hidden="true" />
          </footer>
        ) : null}
      </div>
    </main>
  );
}
