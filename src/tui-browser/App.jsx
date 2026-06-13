import { useEffect, useRef, useState } from "react";

import { useGameFlow } from "../../tui/useGameFlow";
import { renderMapsciiFrame } from "../../js/scene/mapscii/index.js";
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
          Exit
        </button>
        <div className="tui-header-help">Press Q to quit</div>
      </div>
    </header>
  );
}

function Dashboard({ gameState }) {
  const rows = !gameState
    ? [{ label: "Status", value: "Awaiting game start..." }]
    : [
        { label: "Season", value: `${gameState.round || 0} / ${gameState.totalRounds || 4}` },
        { label: "Progress", value: `${gameState.metrics.progress}%`, tone: "yellow" },
        { label: "Forest Health", value: `${gameState.metrics.forestHealth}%`, tone: "green" },
        { label: "Relationships", value: `${gameState.metrics.relationships}%`, tone: "blue" },
        { label: "Compliance", value: `${gameState.metrics.compliance}%`, tone: "magenta" },
        { label: "Budget", value: `${gameState.metrics.budget}%`, tone: "red" },
        { label: "Company", value: gameState.companyName, plain: true },
        { label: "Mode", value: gameState.modeLabel, plain: true },
        { label: "Incident", value: gameState.crisis?.title, plain: true },
        { label: "Role", value: gameState.roleDisplayName || gameState.role?.seasonalName || gameState.role?.name, plain: true },
        { label: "Area", value: gameState.area?.name, plain: true },
      ].filter((row) => row.value !== undefined && row.value !== null);

  return (
    <aside className="tui-panel tui-dashboard">
      <div className="tui-panel-title">Dashboard</div>
      <div className="tui-dashboard-body">
        {rows.map((row) => (
          <div className="tui-dashboard-row" key={row.label}>
            <span className="tui-dashboard-label">{row.label}</span>
            <span className={`tui-dashboard-value ${row.tone ? `tone-${row.tone}` : ""}`}>
              {row.plain ? row.value : typeof row.value === "number" ? row.value : row.value}
            </span>
          </div>
        ))}
      </div>
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

function ContentView({ data }) {
  if (!data) return null;

  if (data.type === "message") {
    return (
      <div className="tui-content-stack">
        <NoticeBlock notice={data.notice} />
        {data.heading ? <div className="tui-heading">{data.heading}</div> : null}
        {data.body ? <p className="tui-copy preserve">{data.body}</p> : null}
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
            <p className="tui-copy preserve">{data.decisionPrompt || "Choose the response that best protects the current work."}</p>
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
    return (
      <div className="tui-content-stack">
        <NoticeBlock notice={data.notice} />
        {data.sourceLabel ? <div className="tui-source-label">{data.sourceLabel}</div> : null}
        {data.cardLabel ? <div className="tui-source-label">{data.cardLabel}</div> : null}
        {data.phaseLabel ? <div className="tui-source-label tone-yellow">{data.phaseLabel}</div> : null}
        <div className="tui-heading">{data.title}</div>
        {data.type === "scenario" ? (
          <div className="tui-scenario-grid">
            <div className="tui-mini-panel">
              <div className="tui-subheading">Incident Status</div>
              <div className="tui-detail-list">
                {data.weather ? <div className="tui-copy preserve">{`Weather: ${data.weather}`}</div> : null}
                {data.deadline ? <div className="tui-copy preserve">{`Deadline: ${data.deadline}`}</div> : null}
                {Object.entries(data.status || {}).map(([label, value]) => (
                  <div className="tui-copy preserve" key={label}>{`${label}: ${value}`}</div>
                ))}
              </div>
            </div>
            <div className="tui-mini-panel">
              <div className="tui-subheading">Block Map</div>
              <pre className="tui-scenario-map">{data.map}</pre>
            </div>
          </div>
        ) : null}
        <p className="tui-copy preserve">{data.description}</p>
        <CardContext data={data} />
        {data.type === "scenario" && data.intelLines?.length ? (
          <>
            <div className="tui-subheading">Intel Feed</div>
            <div className="tui-detail-list">
              {data.intelLines.map((line, idx) => (
                <p className="tui-copy dim preserve" key={`intel-${idx}`}>{line}</p>
              ))}
            </div>
          </>
        ) : null}
      </div>
    );
  }

  if (data.type === "summary") {
    return (
      <div className="tui-content-stack">
        <NoticeBlock notice={data.notice} />
        <div className="tui-heading">{data.heading}</div>
        <p className="tui-copy preserve">{data.body}</p>
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

function CardContext({ data }) {
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [data]);

  const hasContext = Boolean(
    data.context?.operation || data.context?.objective || data.context?.stakes
    || data.whyNow || data.surfaceReason || data.flavor
  );
  if (!hasContext) return null;

  if (!open) {
    return (
      <button type="button" className="tui-context-toggle" onClick={() => setOpen(true)}>
        ▸ More context
      </button>
    );
  }

  return (
    <div className="tui-context-detail">
      {data.context?.operation ? (
        <>
          <div className="tui-subheading">The job</div>
          <p className="tui-copy preserve">{data.context.operation}</p>
          {data.context?.objective ? <p className="tui-copy dim preserve">{`Objective: ${data.context.objective}`}</p> : null}
        </>
      ) : null}
      {data.flavor ? <p className="tui-copy dim preserve">{data.flavor}</p> : null}
      {data.context?.stakes || data.whyNow || data.surfaceReason ? (
        <>
          <div className="tui-subheading">Why it matters</div>
          {data.context?.stakes ? <p className="tui-copy preserve">{data.context.stakes}</p> : null}
          {data.whyNow ? <p className="tui-copy dim preserve">{data.whyNow}</p> : null}
          {data.surfaceReason ? <p className="tui-copy dim preserve">{data.surfaceReason}</p> : null}
        </>
      ) : null}
      <button type="button" className="tui-context-toggle" onClick={() => setOpen(false)}>
        ▾ Hide context
      </button>
    </div>
  );
}

function OptionsPanel({ options, optionDetails, heading, tone, selected, onSelect, isCrisis }) {
  if (!options.length) return null;

  const toneClass =
    tone === "danger" ? "red" : tone === "warning" ? "yellow" : tone ? "blue" : "";
  const title = heading || (isCrisis ? "Command Menu" : "Options");

  return (
    <section className="tui-panel tui-options">
      <div className="tui-panel-title">
        <span className={toneClass ? `tone-${toneClass}` : ""}>{title}</span>
        <span className="tui-options-hint">↑↓ · Enter</span>
      </div>
      <div className="tui-options-list">
        {options.map((label, index) => {
          const text = optionDetails?.[index]?.outcome || label;
          return (
            <button
              key={`${label}-${index}`}
              type="button"
              className={`tui-option ${index === selected ? "selected" : ""}`}
              onClick={() => onSelect(index)}
            >
              <span className="tui-option-number">{index + 1}</span>
              <span className="tui-option-label">{text}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function FieldRadio({ mode, inputText, contentData, art, onInputChange, onSubmitName, isCrisis }) {
  return (
    <section className="tui-panel tui-field-radio">
      <div className="tui-panel-title">{isCrisis ? "Scenario Console" : "Field Radio"}</div>
      <div className="tui-field-layout">
        <div className="tui-field-main">
          {mode === "setup-name" ? (
            <NameInput inputText={inputText} onInputChange={onInputChange} onSubmit={onSubmitName} />
          ) : (
            <ContentView data={contentData} />
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
    if (state.mode === "setup-name") {
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
              onInputChange={setInputText}
              onSubmitName={submitCurrent}
            />
            {state.animFrame ? (
              <section className="tui-panel tui-overlay">
                <div className="tui-panel-title">Animation</div>
                <pre className="tui-art">{state.animFrame}</pre>
              </section>
            ) : null}
            <OptionsPanel
              options={state.options}
              optionDetails={state.contentData?.optionDetails}
              heading={state.contentData?.optionHeading}
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
