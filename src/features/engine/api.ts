import { commands } from "../../generated/tauri";
export const readEngineStatus = () => commands.codexEngineStatus();
export const checkEngineUpdates = () => commands.codexEngineCheck();
export const prepareEngineUpdate = () => commands.codexEnginePrepareUpdate();
