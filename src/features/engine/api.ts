import { commands } from "../../generated/tauri";
export const readEngineStatus = () => commands.codexEngineStatus();
