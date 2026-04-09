import { useEffect, useState } from "react";

import { useGameFlow } from "../../tui/useGameFlow";
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

function Header() {
  return (
    <header className="tui-header">
      <div className="tui-header-title">
        <span className="tui-header-brand">BC Forestry Trail</span>
        <span className="tui-header-tag">Terminal Edition</span>
      </div>
      <div className="tui-header-help">Press Q to quit</div>
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
        { label: "Role", value: gameState.role?.name, plain: true },
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

function NameInput({ inputText }) {
  return (
    <div className="tui-content-stack">
      <div className="tui-heading">Welcome to BC Forestry Trail</div>
      <p className="tui-copy">Enter your Company Name:</p>
      <p className="tui-copy dim">(Press Enter for default 'Forest Co-op')</p>
      <pre className="tui-name-input">{`> ${inputText}█`}</pre>
    </div>
  );
}

function ContentView({ data }) {
  if (!data) return null;

  if (data.type === "message") {
    return (
      <div className="tui-content-stack">
        {data.heading ? <div className="tui-heading">{data.heading}</div> : null}
        {data.body ? <p className="tui-copy preserve">{data.body}</p> : null}
      </div>
    );
  }

  if (data.type === "setup") {
    return (
      <div className="tui-content-stack">
        <div className="tui-heading">{data.heading}</div>
        {data.subtitle ? <p className="tui-copy dim">{data.subtitle}</p> : null}
      </div>
    );
  }

  if (data.type === "task" || data.type === "issue") {
    return (
      <div className="tui-content-stack">
        <div className="tui-heading">{data.title}</div>
        <p className="tui-copy preserve">{data.description}</p>
        {data.flavor ? <p className="tui-copy dim preserve">{data.flavor}</p> : null}
        <div className="tui-subheading">Available Options</div>
        <div className="tui-detail-list">
          {data.optionDetails.map((option, idx) => (
            <div className="tui-detail-item" key={`${option.label}-${idx}`}>
              <div className="tui-detail-label">{`${idx + 1}. ${option.label}`}</div>
              {option.outcome ? <div className="tui-detail-copy">{option.outcome}</div> : null}
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (data.type === "summary") {
    return (
      <div className="tui-content-stack">
        <div className="tui-heading">{data.heading}</div>
        <p className="tui-copy preserve">{data.body}</p>
        <div className="tui-detail-list">
          {data.bullets.map((bullet) => (
            <div className="tui-copy preserve" key={bullet}>
              • {bullet}
            </div>
          ))}
        </div>
        {data.achievements?.length ? (
          <>
            <div className="tui-subheading">Achievements</div>
            {data.achievements.map((achievement) => (
              <div className="tui-copy tone-green" key={achievement}>
                {achievement}
              </div>
            ))}
          </>
        ) : null}
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

function OptionsPanel({ options, selected, onSelect }) {
  if (!options.length) return null;

  return (
    <section className="tui-panel tui-options">
      <div className="tui-panel-title">Options (Use Arrow Keys & Enter)</div>
      <div className="tui-options-list">
        {options.map((label, index) => (
          <button
            key={`${label}-${index}`}
            type="button"
            className={`tui-option ${index === selected ? "selected" : ""}`}
            onClick={() => onSelect(index)}
          >
            {` ${index + 1}. ${label} `}
          </button>
        ))}
      </div>
    </section>
  );
}

function FieldRadio({ mode, inputText, contentData, art }) {
  return (
    <section className="tui-panel tui-field-radio">
      <div className="tui-panel-title">Field Radio</div>
      <div className="tui-field-layout">
        <div className="tui-field-main">
          {mode === "setup-name" ? (
            <NameInput inputText={inputText} />
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

  const state = useGameFlow({
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
        state.handleKey(toKeyInput(event));
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [state]);

  return (
    <main className="tui-app-shell">
      <div className="tui-shell">
        <Header />
        <div className="tui-main">
          <Dashboard gameState={state.gameState} />
          <div className="tui-stage">
            <FieldRadio
              mode={state.mode}
              inputText={state.inputText}
              contentData={state.contentData}
              art={state.art}
            />
            {state.animFrame ? (
              <section className="tui-panel tui-overlay">
                <div className="tui-panel-title">Animation</div>
                <pre className="tui-art">{state.animFrame}</pre>
              </section>
            ) : null}
            <OptionsPanel
              options={state.options}
              selected={state.selected}
              onSelect={state.selectOption}
            />
          </div>
        </div>
      </div>
    </main>
  );
}
