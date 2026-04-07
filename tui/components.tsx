import React, { useState, useEffect } from "react";
import { SEASONS } from "../js/engine.js";
import { C } from "./palette";
import type { ContentData } from "./types";
import type { ArtSequence } from "./art";

// ── Header ───────────────────────────────────────────
export function Header() {
  return (
    <box
      style={{
        height: 3,
        backgroundColor: C.headerBg,
        paddingLeft: 1,
        flexDirection: "row",
        alignItems: "center",
      }}
      border={true}
      borderStyle="single"
      borderColor={C.headerBg}
    >
      <text content="BC Forestry Trail" style={{ fg: C.white, bold: true }} />
      <text content={" \u2014 Terminal Edition"} style={{ fg: C.dim }} />
      <box style={{ flexGrow: 1 }} />
      <text content={"Press Q to quit "} style={{ fg: C.dim }} />
    </box>
  );
}

// ── Dashboard ────────────────────────────────────────
export function Dashboard({ gameState }: { gameState: any }) {
  return (
    <box
      style={{
        width: 28,
        paddingLeft: 1,
        paddingTop: 0,
        flexDirection: "column",
      }}
      border={true}
      borderStyle="single"
      borderColor={C.dashBorder}
      title={" Dashboard "}
    >
      {gameState ? <DashboardStats gs={gameState} /> : (
        <text content="Awaiting game start..." style={{ fg: C.dim }} />
      )}
    </box>
  );
}

function DashboardStats({ gs }: { gs: any }) {
  const season = SEASONS[Math.min(gs.round - 1, SEASONS.length - 1)];
  return (
    <>
      <text
        content={gs.round > 0 ? `Season ${gs.round} of ${gs.totalRounds}` : "Setup Phase"}
        style={{ fg: C.white, bold: true }}
      />
      {gs.round > 0 && <text content={season} style={{ fg: C.green }} />}
      <text content="" />
      <text content="Metrics" style={{ fg: C.white, bold: true }} />
      <text content={`Progress:      ${gs.metrics.progress}`} style={{ fg: C.yellow }} />
      <text content={`Forest Health: ${gs.metrics.forestHealth}`} style={{ fg: C.green }} />
      <text content={`Relationships: ${gs.metrics.relationships}`} style={{ fg: C.blue }} />
      <text content={`Compliance:    ${gs.metrics.compliance}`} style={{ fg: C.magenta }} />
      <text content={`Budget:        ${gs.metrics.budget}`} style={{ fg: C.red }} />
      <text content="" />
      <text content="Company" style={{ fg: C.white, bold: true }} />
      <text content={gs.companyName} style={{ fg: C.dim }} />
      <text content="" />
      <text content="Role" style={{ fg: C.white, bold: true }} />
      <text content={gs.role.name} style={{ fg: C.dim }} />
      <text content="" />
      <text content="Area" style={{ fg: C.white, bold: true }} />
      <text content={gs.area.name} style={{ fg: C.dim }} />
    </>
  );
}

// ── Ambient Art (loops through frames) ───────────────
function AmbientArt({ sequence }: { sequence: ArtSequence }) {
  const [frameIdx, setFrameIdx] = useState(0);

  useEffect(() => {
    setFrameIdx(0);
    if (sequence.frames.length <= 1) return;
    const id = setInterval(() => {
      setFrameIdx((i) => (i + 1) % sequence.frames.length);
    }, sequence.delay);
    return () => clearInterval(id);
  }, [sequence]);

  return (
    <text content={sequence.frames[frameIdx] ?? ""} style={{ fg: C.art }} />
  );
}

// ── Field Radio (content + optional animated art column) ──
export function FieldRadio({
  children,
  art,
}: {
  children: React.ReactNode;
  art: ArtSequence | null;
}) {
  return (
    <box
      style={{ flexGrow: 1, flexDirection: "row" }}
      border={true}
      borderStyle="single"
      borderColor={C.fieldBorder}
      title={" Field Radio "}
    >
      <box
        style={{
          flexGrow: 1,
          paddingLeft: 1,
          paddingRight: 1,
          overflow: "hidden",
          flexDirection: "column",
        }}
      >
        {children}
      </box>

      {art ? (
        <box style={{ width: 25, paddingLeft: 1, paddingTop: 1 }}>
          <AmbientArt sequence={art} />
        </box>
      ) : null}
    </box>
  );
}

// ── Options Panel ────────────────────────────────────
export function OptionsPanel({
  options,
  selected,
}: {
  options: string[];
  selected: number;
}) {
  if (options.length === 0) return null;
  return (
    <box
      style={{
        height: options.length + 2,
        paddingLeft: 1,
        flexDirection: "column",
      }}
      border={true}
      borderStyle="single"
      borderColor={C.optBorder}
      title={" Options (Use Arrow Keys & Enter) "}
    >
      {options.map((label, i) => (
        <text
          key={`opt-${i}`}
          content={` ${i + 1}. ${label} `}
          style={{
            bg: i === selected ? C.selBg : undefined,
            fg: i === selected ? C.white : C.dim,
            bold: i === selected,
          }}
        />
      ))}
    </box>
  );
}

// ── Animation Overlay ────────────────────────────────
export function AnimationOverlay({
  frame,
  cols,
  rows,
}: {
  frame: string;
  cols: number;
  rows: number;
}) {
  return (
    <box
      style={{
        position: "absolute",
        top: Math.floor(rows * 0.2),
        left: Math.floor(cols * 0.25),
        width: Math.floor(cols * 0.5),
        height: Math.floor(rows * 0.5),
        backgroundColor: C.overlayBg,
        paddingLeft: 2,
        paddingTop: 1,
        flexDirection: "column",
      }}
      border={true}
      borderStyle="single"
      borderColor={C.overlayBorder}
      title={" Animation "}
    >
      <text content={frame} style={{ fg: C.green }} />
    </box>
  );
}

// ── Name Input Screen ────────────────────────────────
export function NameInput({ inputText }: { inputText: string }) {
  return (
    <>
      <text content="Welcome to BC Forestry Trail" style={{ fg: C.white, bold: true }} />
      <text content="" />
      <text content="Enter your Company Name:" style={{ fg: C.cyan }} />
      <text
        content={"(Press Enter for default 'Forest Co-op')"}
        style={{ fg: C.dim }}
      />
      <text content="" />
      <text content={`> ${inputText}\u2588`} style={{ fg: C.green }} />
    </>
  );
}

// ── Content View (structured rendering) ──────────────
export function ContentView({ data }: { data: ContentData }) {
  switch (data.type) {
    case "message":
      return (
        <>
          {data.heading && (
            <text content={data.heading} style={{ fg: C.yellow, bold: true }} />
          )}
          {data.body ? (
            <>
              <text content="" />
              <text content={data.body} style={{ fg: C.white }} />
            </>
          ) : null}
        </>
      );

    case "setup":
      return (
        <>
          <text content={data.heading} style={{ fg: C.white, bold: true }} />
          {data.subtitle && (
            <>
              <text content="" />
              <text content={data.subtitle} style={{ fg: C.dim }} />
            </>
          )}
        </>
      );

    case "task":
    case "issue":
      return (
        <>
          <text content={data.title} style={{ fg: C.yellow, bold: true }} />
          <text content="" />
          <text content={data.description} style={{ fg: C.white }} />
          {data.flavor && (
            <>
              <text content="" />
              <text content={data.flavor} style={{ fg: C.dim, italic: true }} />
            </>
          )}
          <text content="" />
          <text content="Available Options:" style={{ fg: C.white, bold: true }} />
          {data.optionDetails.map((opt, i) => (
            <box key={`detail-${i}`} style={{ flexDirection: "column", paddingTop: 1 }}>
              <text
                content={`${i + 1}. ${opt.label}`}
                style={{ fg: C.cyan }}
              />
              {opt.outcome && (
                <box style={{ paddingLeft: 3 }}>
                  <text
                    content={opt.outcome}
                    style={{ fg: C.dim }}
                  />
                </box>
              )}
            </box>
          ))}
        </>
      );

    case "summary":
      return (
        <>
          <text content={data.heading} style={{ fg: C.yellow, bold: true }} />
          <text content="" />
          <text content={data.body} style={{ fg: C.white }} />
          <text content="" />
          {data.bullets.map((b, i) => (
            <text
              key={`bullet-${i}`}
              content={`\u2022 ${b}`}
              style={{ fg: C.white }}
            />
          ))}
          {data.achievements && data.achievements.length > 0 && (
            <>
              <text content="" />
              <text content="Achievements:" style={{ fg: C.yellow, bold: true }} />
              {data.achievements.map((a, i) => (
                <text
                  key={`ach-${i}`}
                  content={a}
                  style={{ fg: C.green }}
                />
              ))}
            </>
          )}
        </>
      );

    default:
      return null;
  }
}
