import { useEffect, useRef, useState } from "react";
import { TuiGameController } from "./controller.js";

type UseGameFlowOptions = {
  onExit?: () => void;
};

export function useGameFlow(options: UseGameFlowOptions = {}) {
  const controllerRef = useRef<TuiGameController | null>(null);

  if (!controllerRef.current) {
    controllerRef.current = new TuiGameController(options);
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
    restart: () => controller.restart(),
    selectOption: (index: number) => controller.selectOption(index),
  };
}
