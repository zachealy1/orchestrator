import { useEffect, useRef, useState } from "react";
import { AsyncQuestionController, type AsyncQuestionDependencies } from "./AsyncQuestionController";

export function useAsyncQuestions(dependencies: AsyncQuestionDependencies) {
  const current = useRef(dependencies);
  current.current = dependencies;
  const [controller] = useState(() => new AsyncQuestionController(() => current.current));
  useEffect(() => { controller.reconcile(); });
  useEffect(() => () => controller.dispose(), [controller]);
  return controller;
}
