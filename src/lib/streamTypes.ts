import type { StreamIdentity } from "./streamIdentity";
import type { ComposerContextFile } from "../features/composer/types";

export type StreamActivityEvent = {
  id: string;
  kind: "message" | "activity" | "command" | "file" | "reasoning" | "system";
  text: string;
  timestamp: string;
  activityIds?: string[];
  identity?: StreamIdentity;
  streaming?: boolean;
  statusLabel?: string;
};

export type StreamSteerEvent = {
  id: string;
  kind: "steer";
  text: string;
  timestamp: string;
  contextFiles: ComposerContextFile[];
  delivery: "pending" | "sent";
  activityIds?: never;
};

export type StreamEvent = StreamActivityEvent | StreamSteerEvent;
