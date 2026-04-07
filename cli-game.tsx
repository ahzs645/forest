#!/usr/bin/env bun

import React, { useCallback } from "react";
import { createCliRenderer } from "@opentui/core";
import { createRoot, useKeyboard, useTerminalDimensions } from "@opentui/react";

import { useGameFlow } from "./tui/useGameFlow";
import {
  Header,
  Dashboard,
  FieldRadio,
  OptionsPanel,
  AnimationOverlay,
  NameInput,
  ContentView,
} from "./tui/components";

function App() {
  const {
    mode,
    inputText,
    contentData,
    options,
    selected,
    art,
    animFrame,
    gameState,
    handleKey,
  } = useGameFlow();

  const { width: cols, height: rows } = useTerminalDimensions();

  // Stable wrapper so useKeyboard never re-subscribes
  const keyRef = React.useRef<(k: any) => void>();
  keyRef.current = handleKey;
  useKeyboard(useCallback((k: any) => keyRef.current?.(k), []));

  const showOpts = mode !== "setup-name" && options.length > 0;

  return (
    <box style={{ flexDirection: "column", width: "100%", height: "100%" }}>
      <Header />

      <box style={{ flexDirection: "row", flexGrow: 1 }}>
        <Dashboard gameState={gameState} />

        <box style={{ flexGrow: 1, flexDirection: "column" }}>
          <FieldRadio art={art}>
            {mode === "setup-name" ? (
              <NameInput inputText={inputText} />
            ) : (
              <ContentView data={contentData} />
            )}
          </FieldRadio>

          {showOpts && <OptionsPanel options={options} selected={selected} />}
        </box>
      </box>

      {animFrame !== null && (
        <AnimationOverlay frame={animFrame} cols={cols} rows={rows} />
      )}
    </box>
  );
}

// ── Renderer bootstrap ───────────────────────────────
const renderer = await createCliRenderer({
  exitOnCtrlC: false,
  useAlternateScreen: true,
  useMouse: false,
});

const root = createRoot(renderer);
root.render(<App />);

let shuttingDown = false;
function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  root.unmount();
  renderer.destroy();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
