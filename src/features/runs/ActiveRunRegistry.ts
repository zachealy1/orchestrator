import type { ActiveRunControl } from "./runtimeTypes";
import { assertWorkMayStart } from "../../shared/updateInterlock";

export class ActiveRunRegistry {
  private readonly controls = new Map<string, ActiveRunControl>();
  private readonly listeners = new Set<() => void>();
  private revision = 0;

  readonly subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  readonly getSnapshot = () => this.revision;

  get(clientId: string) {
    return this.controls.get(clientId);
  }

  values() {
    return this.controls.values();
  }

  forEach(callback: (control: ActiveRunControl) => void) {
    this.controls.forEach(callback);
  }

  set(clientId: string, control: ActiveRunControl) {
    assertWorkMayStart();
    this.controls.set(clientId, control);
    this.touch();
  }

  delete(clientId: string) {
    const deleted = this.controls.delete(clientId);
    if (deleted) this.touch();
    return deleted;
  }

  touch() {
    this.revision += 1;
    this.listeners.forEach((listener) => listener());
  }

  dispose() {
    this.controls.clear();
    this.listeners.clear();
    this.revision += 1;
  }
}
