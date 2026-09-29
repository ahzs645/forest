import { useEffect, useMemo, useRef, useState } from "react";

import { GLOSSARY_TERMS } from "../../js/data/glossary.js";
import { LEGACY_GLOSSARY_TERMS } from "../../js/data/legacyGlossary.js";
import { getRoleProfessionalContext } from "../../js/data/professionalPractice.js";
import { buildSeasonalLogEntries } from "../../js/game/seasonalAdapter.js";

// The same accelerators the hub terminal answers to (README, Seasonal
// Strategy). Everything they open is also reachable from the header buttons.
export const OVERLAY_KEYS = {
  g: "glossary",
  p: "intel",
  l: "log",
  s: "status",
  "?": "help",
};

const OVERLAY_TITLES = {
  glossary: "Glossary",
  intel: "Professional / compliance intel",
  log: "Journey log",
  status: "Status",
  help: "How to play",
};

function GlossaryBody() {
  const [query, setQuery] = useState("");
  const terms = useMemo(() => {
    const seen = new Set();
    return [...GLOSSARY_TERMS, ...LEGACY_GLOSSARY_TERMS]
      .filter((entry) => entry && typeof entry.term === "string" && typeof entry.description === "string")
      .filter((entry) => {
        const key = entry.term.trim().toLowerCase();
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => a.term.localeCompare(b.term));
  }, []);
  const q = query.trim().toLowerCase();
  const shown = (q
    ? terms.filter((entry) => entry.term.toLowerCase().includes(q) || entry.description.toLowerCase().includes(q))
    : terms
  ).slice(0, 80);

  return (
    <>
      <input
        className="tui-text-input tui-overlay-search"
        type="search"
        placeholder="Search terms..."
        aria-label="Search the glossary"
        value={query}
        autoFocus
        onChange={(event) => setQuery(event.target.value)}
      />
      {shown.length ? shown.map((entry) => (
        <div className="tui-overlay-entry" key={entry.term}>
          <div className="tui-overlay-entry-title">{entry.term}</div>
          <p className="tui-copy dim">{entry.description}</p>
        </div>
      )) : <p className="tui-copy dim">No matches.</p>}
    </>
  );
}

function IntelSection({ title, items }) {
  if (!items?.length) return null;
  return (
    <>
      <div className="tui-subheading">{title}</div>
      {items.map((item) => (
        <div className="tui-overlay-entry" key={item.id || item.title}>
          <div className="tui-overlay-entry-title">{item.title}</div>
          {item.summary ? <p className="tui-copy dim">{item.summary}</p> : null}
        </div>
      ))}
    </>
  );
}

function IntelBody({ gameState }) {
  const roleId = gameState?.role?.id;
  if (!roleId) {
    return <p className="tui-copy dim">Pick a role and an area to see the obligations, process hooks and failure patterns that come with them.</p>;
  }
  const intel = getRoleProfessionalContext(roleId, {
    area: gameState.area,
    obligationCount: 4,
    paperworkCount: 4,
    breachCount: 4,
  });
  return (
    <>
      <p className="tui-copy">{`${gameState.roleDisplayName || roleId}${gameState.area?.name ? ` · ${gameState.area.name}` : ""}`}</p>
      {intel.areaBurden?.watchouts?.length ? (
        <>
          <div className="tui-subheading">{intel.areaBurden.title || "Area watch-outs"}</div>
          <ul className="tui-area-list">
            {intel.areaBurden.watchouts.map((line) => <li className="tui-copy dim" key={line}>{line}</li>)}
          </ul>
        </>
      ) : null}
      <IntelSection title="Obligations" items={intel.obligations} />
      <IntelSection title="Process hooks" items={intel.paperwork} />
      <IntelSection title="How files fail" items={intel.breaches} />
    </>
  );
}

function LogBody({ gameState }) {
  const rows = buildSeasonalLogEntries(gameState);
  if (!rows.length) return <p className="tui-copy dim">No calls made yet this year.</p>;
  return rows.map((row, index) => (
    <div className="tui-overlay-entry" key={`log-${index}`}>
      <div className="tui-overlay-entry-title">{`${row.dayLabel} ${row.day} ${row.icon} ${row.summary}`}</div>
      {row.detail ? <p className="tui-copy dim">{row.detail}</p> : null}
    </div>
  ));
}

function HelpBody() {
  const rows = [
    ["1–9", "Pick an option"],
    ["↑ ↓ / K J", "Move through options, Enter confirms"],
    ["S", "Status: meters, season, mandate"],
    ["G", "Glossary"],
    ["L", "Journey log for this year"],
    ["P", "Professional and compliance intel for your role"],
    ["?", "This screen"],
    ["Esc", "Close a panel; on a card, leave the run (it is autosaved)"],
  ];
  return (
    <>
      <p className="tui-copy">Four seasons, five meters. Every card is one call; some help now and cost you later, and delayed fallout says which choice it came from.</p>
      <div className="tui-overlay-keys">
        {rows.map(([key, text]) => (
          <div className="tui-overlay-key-row" key={key}>
            <span className="tui-overlay-key">{key}</span>
            <span className="tui-copy">{text}</span>
          </div>
        ))}
      </div>
    </>
  );
}

/**
 * The glossary / intel / log / status / help panels, over the stage.
 * `status` is rendered by the caller (it reuses the dashboard's meters).
 */
export function Overlay({ kind, gameState, status, onClose }) {
  const dialogRef = useRef(null);
  useEffect(() => {
    // Search fields take focus themselves; everything else focuses the panel
    // so screen readers announce it and Escape reaches the page handler.
    if (!dialogRef.current?.querySelector("input")) dialogRef.current?.focus();
  }, [kind]);

  if (!kind) return null;
  let body = null;
  if (kind === "glossary") body = <GlossaryBody />;
  else if (kind === "intel") body = <IntelBody gameState={gameState} />;
  else if (kind === "log") body = <LogBody gameState={gameState} />;
  else if (kind === "status") body = status;
  else body = <HelpBody />;

  return (
    <div className="tui-overlay-backdrop" onClick={onClose}>
      <section
        className="tui-panel tui-overlay-panel"
        role="dialog"
        aria-modal="true"
        aria-label={OVERLAY_TITLES[kind]}
        tabIndex={-1}
        ref={dialogRef}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="tui-panel-title tui-overlay-title">
          <span>{OVERLAY_TITLES[kind]}</span>
          <button type="button" className="tui-header-button tui-overlay-close" onClick={onClose}>
            Close · Esc
          </button>
        </div>
        <div className="tui-overlay-body">{body}</div>
      </section>
    </div>
  );
}
