import { useState, useRef, useCallback } from "react";
import { FORESTER_ROLES, OPERATING_AREAS } from "../js/data/index.js";
import {
  createInitialState,
  getRoleTasks,
  applyOptionOutcome,
  applyRoundConsequences,
  drawIssue,
  buildSummary,
  SEASONS,
} from "../js/engine.js";
import { detectArt, matchAnimation, type ArtSequence } from "./art";
import type { ContentData } from "./types";

export function useGameFlow() {
  // Display state
  const [mode, setMode] = useState("setup-name");
  const [inputText, setInputText] = useState("");
  const [contentData, setContentData] = useState<ContentData>({
    type: "setup",
    heading: "Welcome to BC Forestry Trail",
  });
  const [options, setOptions] = useState<string[]>([]);
  const [selected, setSelected] = useState(0);
  const [art, setArt] = useState<ArtSequence | null>(null);
  const [animFrame, setAnimFrame] = useState<string | null>(null);

  // Force re-render trigger (game engine mutates state objects in place)
  const [, bump] = useState(0);
  const rerender = useCallback(() => bump((n) => n + 1), []);

  // Mutable refs — game engine mutates these directly
  const gsRef = useRef<any>(null);
  const queueRef = useRef<any[]>([]);
  const selectCbRef = useRef<((idx: number) => void) | null>(null);

  // ── helpers ──
  const present = useCallback(
    (
      data: ContentData,
      opts: string[],
      cb: (idx: number) => void,
      artSeq: ArtSequence | null = null,
    ) => {
      setContentData(data);
      setOptions(opts);
      setSelected(0);
      setArt(artSeq);
      selectCbRef.current = cb;
    },
    [],
  );

  const playAnim = useCallback(
    (frames: string[], delay: number, onDone: () => void) => {
      let i = 0;
      setAnimFrame(frames[0]);
      const id = setInterval(() => {
        i++;
        if (i >= frames.length) {
          clearInterval(id);
          setAnimFrame(null);
          onDone();
        } else {
          setAnimFrame(frames[i]);
        }
      }, delay);
    },
    [],
  );

  // ── game flow (via ref to avoid stale closures) ──
  const processNextRef = useRef<() => void>();

  const startRound = useCallback(() => {
    const gs = gsRef.current;
    gs.round++;
    const season = SEASONS[gs.round - 1];
    const q = queueRef.current;

    q.push({
      type: "message",
      text: season,
      body: "A new season begins. Prepare your crew.",
    });
    for (const task of getRoleTasks(gs)) q.push({ type: "task", data: task });
    const issue = drawIssue(gs);
    if (issue) q.push({ type: "issue", data: issue });
    q.push({
      type: "consequences",
      execute: () => {
        const cons = applyRoundConsequences(gs);
        if (cons?.length) {
          queueRef.current.unshift({
            type: "message",
            text: "End of Season Consequences",
            body: cons.map((c: string) => `- ${c}`).join("\n"),
          });
        }
        rerender();
        processNextRef.current?.();
      },
    });
    processNextRef.current?.();
  }, [rerender]);

  const processNext = useCallback(() => {
    const q = queueRef.current;
    const gs = gsRef.current;

    if (q.length === 0) {
      if (gs && gs.round < gs.totalRounds) {
        startRound();
      } else {
        // End game
        const summary = buildSummary(gs);
        setMode("end");
        present(
          {
            type: "summary",
            heading: "Year End Review",
            body: summary.overall,
            bullets: summary.messages,
            achievements: summary.achievements,
          },
          ["Play Again", "Quit"],
          (idx) => {
            if (idx === 0) {
              gsRef.current = null;
              queueRef.current = [];
              setMode("setup-name");
              setInputText("");
              setContentData({
                type: "setup",
                heading: "Welcome to BC Forestry Trail",
              });
              setOptions([]);
              setArt(null);
              rerender();
            } else {
              process.exit(0);
            }
          },
        );
      }
      return;
    }

    const phase = q.shift()!;
    const phaseText =
      phase.text ??
      (phase.data
        ? `${phase.data.title} ${phase.data.description ?? ""}`
        : "");
    const artText = detectArt(phaseText, gs);

    if (phase.type === "message") {
      present(
        {
          type: "message",
          heading: phase.text,
          body: phase.body ?? "",
        },
        ["Continue"],
        () => processNextRef.current?.(),
        artText,
      );
    } else if (phase.type === "task" || phase.type === "issue") {
      const item = phase.data;
      present(
        {
          type: phase.type,
          title: item.title,
          description: item.description ?? "",
          flavor: phase.type === "issue" ? item.flavor : undefined,
          optionDetails: item.options.map((o: any) => ({
            label: o.label,
            outcome: o.outcome,
          })),
        },
        item.options.map((o: any) => o.label),
        (idx) => {
          const opt = item.options[idx];
          applyOptionOutcome(gs, opt, {
            type: phase.type,
            id: item.id,
            title: item.title,
            option: opt.label,
            round: gs.round,
          });
          rerender();

          const after = () => {
            queueRef.current.unshift({
              type: "message",
              text: `Outcome: ${opt.label}`,
              body: `${opt.outcome ?? ""}\n\nEffects applied.`,
            });
            processNextRef.current?.();
          };

          // Animation overlay disabled for now
          // const anim = matchAnimation(opt.label);
          // anim ? playAnim(anim.frames, anim.delay, after) : after();
          after();
        },
        artText,
      );
    } else if (phase.type === "consequences") {
      phase.execute();
    }
  }, [present, playAnim, rerender, startRound]);

  processNextRef.current = processNext;

  // ── keyboard handler (called from useKeyboard in App) ──
  const handleKey = useCallback(
    (key: any) => {
      if (key.ctrl && key.name === "c") process.exit(0);
      if (key.name === "escape") process.exit(0);
      if (animFrame !== null) return;

      if (mode === "setup-name") {
        if (key.name === "return") {
          const company = inputText.trim() || "Forest Co-op";
          setMode("setup-role");
          present(
            {
              type: "setup",
              heading: "Select your Specialization",
              subtitle: "Different roles face different challenges.",
            },
            FORESTER_ROLES.map((r: any) => r.name),
            (idx) => {
              const roleId = FORESTER_ROLES[idx].id;
              setMode("setup-area");
              present(
                {
                  type: "setup",
                  heading: "Select your Operating Area",
                  subtitle:
                    "Choose the environment for your operations.",
                },
                OPERATING_AREAS.map((a: any) => a.name),
                (idx2) => {
                  const areaId = OPERATING_AREAS[idx2].id;
                  gsRef.current = createInitialState({
                    companyName: company,
                    roleId,
                    areaId,
                  });
                  setMode("playing");
                  rerender();
                  queueRef.current = [];
                  startRound();
                },
              );
            },
          );
        } else if (key.name === "backspace") {
          setInputText((t) => t.slice(0, -1));
        } else if (key.sequence?.length === 1 && !key.ctrl && !key.meta) {
          setInputText((t) => t + key.sequence);
        }
        return;
      }

      // Option navigation
      if (key.name === "up" || key.name === "k") {
        setSelected((s) => Math.max(0, s - 1));
      } else if (key.name === "down" || key.name === "j") {
        setSelected((s) => Math.min(options.length - 1, s + 1));
      } else if (key.name === "return") {
        selectCbRef.current?.(selected);
      } else if (key.sequence && /^[1-9]$/.test(key.sequence)) {
        const num = parseInt(key.sequence) - 1;
        if (num < options.length) selectCbRef.current?.(num);
      }
    },
    [
      mode,
      inputText,
      options,
      selected,
      animFrame,
      present,
      rerender,
      startRound,
    ],
  );

  return {
    mode,
    inputText,
    contentData,
    options,
    selected,
    art,
    animFrame,
    gameState: gsRef.current,
    handleKey,
  };
}
