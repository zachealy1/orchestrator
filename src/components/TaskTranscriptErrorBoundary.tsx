import { AlertCircle, RefreshCw } from "lucide-react";
import {
  Component,
  type ErrorInfo,
  type ReactNode,
} from "react";

type TaskTranscriptErrorBoundaryProps = {
  children: ReactNode;
  resetKey: string;
  onError?: (error: Error) => void;
};

type TaskTranscriptErrorBoundaryState = {
  error: Error | null;
};

export class TaskTranscriptErrorBoundary extends Component<
  TaskTranscriptErrorBoundaryProps,
  TaskTranscriptErrorBoundaryState
> {
  state: TaskTranscriptErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, _info: ErrorInfo) {
    this.props.onError?.(error);
  }

  componentDidUpdate(previousProps: TaskTranscriptErrorBoundaryProps) {
    if (
      this.state.error &&
      previousProps.resetKey !== this.props.resetKey
    ) {
      this.setState({ error: null });
    }
  }

  private retry = () => {
    this.setState({ error: null });
  };

  render() {
    if (!this.state.error) {
      return this.props.children;
    }

    return (
      <div className="task-transcript-error" role="alert">
        <AlertCircle aria-hidden="true" size={20} />
        <div>
          <strong>This chat could not be displayed.</strong>
          <p>Try again or open another chat.</p>
        </div>
        <button
          aria-label="Try displaying chat again"
          data-tooltip="Try again"
          onClick={this.retry}
          type="button"
        >
          <RefreshCw aria-hidden="true" size={17} />
        </button>
      </div>
    );
  }
}
