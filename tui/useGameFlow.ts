import { useEffect, useRef, useState } from "react";
import { TuiGameController } from "./controller";

type UseGameFlowOptions = {
  onExit?: () => void;
};

export function useGameFlow(options: UseGameFlowOptions = {}) {
  const controllerRef = useRef<TuiGameController>();

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
    ...snapshot,
    handleKey: (key: any) => controller.handleKey(key),
    restart: () => controller.restart(),
    selectOption: (index: number) => controller.selectOption(index),
  };
}
