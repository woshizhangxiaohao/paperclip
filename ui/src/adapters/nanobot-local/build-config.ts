import type { CreateConfigValues } from "../../components/AgentConfigForm";

export function buildNanobotLocalConfig(v: CreateConfigValues): Record<string, unknown> {
  const ac: Record<string, unknown> = {};
  if (v.command) ac.command = v.command;
  if (v.configPath) ac.configPath = v.configPath;
  if (v.workspacePath || v.cwd) {
    ac.workspace = v.workspacePath || v.cwd;
    ac.cwd = v.workspacePath || v.cwd;
  }
  if (v.promptTemplate) ac.promptTemplate = v.promptTemplate;
  ac.timeoutSec = 0;
  ac.graceSec = 15;
  return ac;
}
