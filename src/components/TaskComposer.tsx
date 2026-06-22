import {
  BrainCircuit,
  ClipboardCheck,
  Play,
  Route,
  Sparkles,
} from "lucide-react";
import type { OssProvider, RouteRecommendation } from "../types";

type Props = {
  disabled: boolean;
  prompt: string;
  improvedPrompt: string;
  routeRecommendation: RouteRecommendation;
  tokenEstimate: number;
  useOss: boolean;
  ossProvider: OssProvider;
  onPromptChange: (prompt: string) => void;
  onUseOssChange: (value: boolean) => void;
  onOssProviderChange: (provider: OssProvider) => void;
  onPreflight: () => void;
  onPlanFirst: () => void;
  onRun: () => void;
};

export function TaskComposer({
  disabled,
  prompt,
  improvedPrompt,
  routeRecommendation,
  tokenEstimate,
  useOss,
  ossProvider,
  onPromptChange,
  onUseOssChange,
  onOssProviderChange,
  onPreflight,
  onPlanFirst,
  onRun,
}: Props) {
  return (
    <section className="composer-panel" aria-label="Task composer">
      <label className="prompt-field">
        <span className="sr-only">Prompt</span>
        <textarea
          value={prompt}
          onChange={(event) => onPromptChange(event.currentTarget.value)}
          placeholder="Do anything"
          rows={5}
        />
      </label>

      <div className="composer-toolbar">
        <button className="secondary" type="button" onClick={onPreflight} disabled={disabled}>
          <ClipboardCheck size={16} />
          Preflight
        </button>
        <button className="secondary" type="button" onClick={onPlanFirst} disabled={disabled}>
          <BrainCircuit size={16} />
          Plan first
        </button>
        <div className={`route-pill ${routeRecommendation}`}>
          <Route size={16} />
          {routeRecommendation === "plan-first" ? "Plan-first" : "Direct run"}
        </div>
        <span className="token-pill">{tokenEstimate.toLocaleString()} tokens</span>
        <button className="send-button" type="button" onClick={onRun} disabled={disabled} aria-label="Run Codex">
          <Play size={16} />
          <span className="sr-only">Run Codex</span>
        </button>
      </div>

      <div className="composer-context-row">
        <label className="toggle">
          <input
            type="checkbox"
            checked={useOss}
            onChange={(event) => onUseOssChange(event.currentTarget.checked)}
          />
          <span>Use Codex OSS mode</span>
        </label>
        <select
          value={ossProvider}
          onChange={(event) => onOssProviderChange(event.currentTarget.value as OssProvider)}
          disabled={!useOss}
          aria-label="OSS provider"
        >
          <option value="ollama">Ollama</option>
          <option value="lmstudio">LM Studio</option>
        </select>
        <span>workspace-write</span>
        <span>on-request approvals</span>
      </div>

      <details className="improved-prompt">
        <summary>
          <Sparkles size={16} />
          <strong>Deterministic prompt structure</strong>
        </summary>
        <pre>{improvedPrompt || "Prompt structure appears here after you type."}</pre>
      </details>
    </section>
  );
}
