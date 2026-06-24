import { runTui } from "./run.js";
import type { AgentSession } from "../agent/session.js";

export interface AppProps {
  session: AgentSession;
  workdir: string;
  initialPrompt?: string;
}

export async function startApp(props: AppProps): Promise<void> {
  await runTui(props);
}
