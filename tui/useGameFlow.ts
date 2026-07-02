import { useEffect, useRef, useState } from "react";
import { TuiGameController } from "./controller.js";

type UseGameFlowOptions = {
  onExit?: () => void;
};

export function useGameFlow(options: UseGameFlowOptions = {}) {
  const controllerRef = useRef<TuiGameController | null>(null);

  if (!controllerRef.current) {
    // A numeric seed (rather than the controller's bare-Math.random default)
    // makes the run serializable: rng.state() exists, so the season-boundary
    // autosave in persistSeasonalSave() can actually write. Drawing the seed
    // from Math.random keeps e2e harnesses that override the global in
    // control of the run.
    const seed = Math.floor(Math.random() * 0x100000000);
    controllerRef.current = new TuiGameController({ ...options, seed });
  }

  const controller = controllerRef.current;
  const [snapshot, setSnapshot] = useState(controller.getState());

  useEffect(() => controller.subscribe(setSnapshot), [controller]);

  useEffect(() => {
    controller.setOnExit(options.onExit);
  }, [controller, options.onExit]);

  return {
    controller,
    ...snapshot,
    handleKey: (key: any) => controller.handleKey(key),
    exitGame: () => controller.exitGame(),
    restart: () => controller.restart(),
    setInputText: (value: string) => controller.setInputText(value),
    selectOption: (index: number) => controller.selectOption(index),
    submitCurrent: () => controller.submitCurrent(),
  };
}
