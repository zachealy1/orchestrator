import type { CodexModel } from "../codex/types";

export function choosePlanImplementationModel(
  availableModels: CodexModel[],
  preferredModel: string | null | undefined,
) {
  return (
    availableModels.find(
      (model) =>
        model.id === preferredModel || model.model === preferredModel,
    ) ??
    availableModels.find((model) => model.isDefault) ??
    availableModels[0] ??
    null
  );
}

export function choosePlanImplementationReasoning(
  model: CodexModel | null,
  preferredEffort: string | null | undefined,
) {
  if (!model) return null;
  const supported = model.supportedReasoningEfforts.map(
    (option) => option.reasoningEffort,
  );
  if (preferredEffort && supported.includes(preferredEffort)) {
    return preferredEffort;
  }
  if (supported.includes(model.defaultReasoningEffort)) {
    return model.defaultReasoningEffort;
  }
  return supported[0] ?? null;
}

