import React, { useState, useEffect } from "react";
import { SEASONS } from "../js/engine.js";
import { C } from "./palette";
import type { ContentData, NoticeData } from "./types";

type ArtSequence = {
  frames: string[];
  delay: number;
};

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
      {gs.modeLabel ? (
        <>
          <text content="" />
          <text content="Mode" style={{ fg: C.white, bold: true }} />
          <text content={gs.modeLabel} style={{ fg: C.dim }} />
        </>
      ) : null}
      {gs.crisis?.title ? (
        <>
          <text content="" />
          <text content="Incident" style={{ fg: C.white, bold: true }} />
          <text content={gs.crisis.title} style={{ fg: C.yellow }} />
        </>
      ) : null}
      <text content="" />
      <text content="Role" style={{ fg: C.white, bold: true }} />
      <text content={gs.roleDisplayName || gs.role.seasonalName || gs.role.name} style={{ fg: C.dim }} />
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

function NoticeView({ notice }: { notice?: NoticeData }) {
  if (!notice) return null;

  const toneMap = {
    info: C.cyan,
    positive: C.green,
    warning: C.yellow,
    danger: C.red,
  };

  return (
    <box
      border={true}
      borderStyle="single"
      borderColor={toneMap[notice.tone || "info"]}
      style={{
        flexDirection: "column",
        paddingLeft: 1,
        paddingRight: 1,
        paddingTop: 1,
        paddingBottom: 1,
      }}
    >
      <text
        content={notice.heading}
        style={{ fg: toneMap[notice.tone || "info"], bold: true }}
      />
      {notice.body ? (
        <>
          <text content="" />
          <text content={notice.body} style={{ fg: C.white }} />
        </>
      ) : null}
    </box>
  );
}

function SummarySection({
  title,
  items,
  color = C.white,
}: {
  title: string;
  items?: string[];
  color?: string;
}) {
  if (!items?.length) return null;

  return (
    <>
      <text content="" />
      <text content={title} style={{ fg: C.yellow, bold: true }} />
      {items.map((item, index) => (
        <text key={`${title}-${index}`} content={item} style={{ fg: color }} />
      ))}
    </>
  );
}

// ── Content View (structured rendering) ──────────────
export function ContentView({ data }: { data: ContentData }) {
  const optionColor = data.type === "assignment" || data.type === "task" || data.type === "issue" || data.type === "event" || data.type === "temptation" || data.type === "scenario"
    ? data.optionTone === "danger"
      ? C.red
      : data.optionTone === "warning"
        ? C.yellow
        : C.cyan
    : C.cyan;

  switch (data.type) {
    case "message":
      return (
        <>
          <NoticeView notice={data.notice} />
          {data.notice ? <text content="" /> : null}
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
          <NoticeView notice={data.notice} />
          {data.notice ? <text content="" /> : null}
          <text content={data.heading} style={{ fg: C.white, bold: true }} />
          {data.subtitle && (
            <>
              <text content="" />
              <text content={data.subtitle} style={{ fg: C.dim }} />
            </>
          )}
        </>
      );

    case "assignment":
    case "task":
    case "issue":
    case "event":
    case "temptation":
    case "scenario":
      return (
        <>
          <NoticeView notice={data.notice} />
          {data.notice ? <text content="" /> : null}
          {data.sourceLabel ? (
            <text content={data.sourceLabel} style={{ fg: C.cyan, bold: true }} />
          ) : null}
          {data.cardLabel ? (
            <text content={data.cardLabel} style={{ fg: C.blue, bold: true }} />
          ) : null}
          {data.phaseLabel ? (
            <text content={data.phaseLabel} style={{ fg: C.yellow, bold: true }} />
          ) : null}
          <text content={data.title} style={{ fg: C.yellow, bold: true }} />
          {data.type === "scenario" ? (
            <>
              <text content="" />
              <text content="Incident Status" style={{ fg: C.white, bold: true }} />
              {data.weather ? <text content={`Weather: ${data.weather}`} style={{ fg: C.white }} /> : null}
              {data.deadline ? <text content={`Deadline: ${data.deadline}`} style={{ fg: C.white }} /> : null}
              {Object.entries(data.status || {}).map(([label, value]) => (
                <text key={label} content={`${label}: ${value}`} style={{ fg: C.dim }} />
              ))}
              {data.map ? (
                <>
                  <text content="" />
                  <text content="Block Map" style={{ fg: C.white, bold: true }} />
                  <text content={data.map} style={{ fg: C.green }} />
                </>
              ) : null}
            </>
          ) : null}
          {data.context?.operation ? (
            <>
              <text content="" />
              <text content="What job am I doing?" style={{ fg: C.white, bold: true }} />
              <text content={data.context.operation} style={{ fg: C.white }} />
              {data.context?.objective ? (
                <text content={`Objective: ${data.context.objective}`} style={{ fg: C.dim }} />
              ) : null}
            </>
          ) : null}
          <text content="" />
          <text content="What changed?" style={{ fg: C.white, bold: true }} />
          <text content={data.description} style={{ fg: C.white }} />
          {data.flavor && (
            <>
              <text content="" />
              <text content={data.flavor} style={{ fg: C.dim, italic: true }} />
            </>
          )}
          {(data.context?.stakes || data.whyNow || data.surfaceReason) && (
            <>
              <text content="" />
              <text content="Why does it matter now?" style={{ fg: C.white, bold: true }} />
              {data.context?.stakes ? <text content={data.context.stakes} style={{ fg: C.white }} /> : null}
              {data.whyNow ? <text content={data.whyNow} style={{ fg: C.dim }} /> : null}
              {data.surfaceReason ? <text content={data.surfaceReason} style={{ fg: C.dim }} /> : null}
            </>
          )}
          {data.type === "scenario" && data.intelLines?.length ? (
            <>
              <text content="" />
              <text content="Intel Feed" style={{ fg: C.white, bold: true }} />
              {data.intelLines.map((line, index) => (
                <text key={`intel-${index}`} content={line} style={{ fg: C.dim }} />
              ))}
            </>
          ) : null}
          <text content="" />
          <text content="What am I deciding?" style={{ fg: C.white, bold: true }} />
          <text content={data.decisionPrompt || "Choose the response that best protects the current work."} style={{ fg: C.white }} />
          <text content="" />
          <text content={`${data.optionHeading || "Choose your response"}:`} style={{ fg: data.optionTone ? optionColor : C.white, bold: true }} />
          {data.optionDetails.map((opt, i) => (
            <box key={`detail-${i}`} style={{ flexDirection: "column", paddingTop: 1 }}>
              <text
                content={`${i + 1}. ${opt.label}`}
                style={{ fg: optionColor }}
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
          <NoticeView notice={data.notice} />
          {data.notice ? <text content="" /> : null}
          <text content={data.heading} style={{ fg: C.yellow, bold: true }} />
          <text content="" />
          <text content={data.body} style={{ fg: C.white }} />
          <SummarySection title="Signals:" items={data.bullets} />
          <SummarySection title="Key Decisions:" items={data.highlights} />
          <SummarySection title="Season Review:" items={data.seasonSummaries} />
          <SummarySection title="Trendlines:" items={data.trendLines} />
          <SummarySection title="Next Year Outlook:" items={data.projection} />
          <SummarySection title="Achievements:" items={data.achievements} color={C.green} />
        </>
      );

    default:
      return null;
  }
}
