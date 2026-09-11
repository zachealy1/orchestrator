import { prepareGoalContext, discardGoalContext } from "../../codexClient";
import type { RunTurnPayloadStageResult } from "./runtimeTypes";

/** Goal activation has no turn input. Retain context using the native app's file-reference convention. */
export async function prepareGoalSubmission(accountId: number, payload: RunTurnPayloadStageResult) {
  const skills = payload.input.filter((item) => item.type === "skill");
  const imagePaths = payload.input.flatMap((item) => item.type === "localImage" ? [item.path] : []);
  const hasContext = Object.keys(payload.additionalContext ?? {}).length > 0 || skills.length > 0;
  const prepared = await prepareGoalContext({
    accountId,
    objective: payload.text,
    contextJson: hasContext ? JSON.stringify({
      supportingContext: payload.additionalContext,
      selectedSkills: skills,
    }) : null,
    imagePaths,
  });
  return {
    ...prepared,
    // Once goal/set has been dispatched, retain files even if its outcome is unknown.
    discard: async () => {
      if (prepared.directoryPath) await discardGoalContext(accountId, prepared.directoryPath);
    },
  };
}
