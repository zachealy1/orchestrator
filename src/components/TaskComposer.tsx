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
    <section className="surface composer" aria-label="Task composer">
      <div className="surface-header">
        <div>
          <p className="eyebrow">Task</p>
          <h2>Compose a Codex run</h2>
        </div>
        <div className={`route-pill ${routeRecommendation}`}>
          <Route size={16} />
          {routeRecommendation === "plan-first" ? "Plan-first" : "Direct run"}
        </div>
      </div>

      <label className="field">
        <span>Prompt</span>
        <textarea
          value={prompt}
          onChange={(event) => onPromptChange(event.currentTarget.value)}
          placeholder="Describe the coding task you want Codex to run in this workspace"
          rows={8}
        />
      </label>

      <div className="composer-meta">
        <span>{tokenEstimate.toLocaleString()} estimated tokens</span>
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
      </div>

      <div className="improved-prompt">
        <div>
          <Sparkles size={16} />
          <strong>Deterministic prompt structure</strong>
        </div>
        <pre>{improvedPrompt || "Prompt structure appears here after you type."}</pre>
      </div>

      <div className="button-row">
        <button className="secondary" type="button" onClick={onPreflight} disabled={disabled}>
          <ClipboardCheck size={16} />
          Preflight
        </button>
        <button className="secondary" type="button" onClick={onPlanFirst} disabled={disabled}>
          <BrainCircuit size={16} />
          Plan first
        </button>
        <button type="button" onClick={onRun} disabled={disabled}>
          <Play size={16} />
          Run Codex
        </button>
      </div>
    </section>
  );
}
