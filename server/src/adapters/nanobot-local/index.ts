import type { AdapterSessionCodec, ServerAdapterModule } from "../types.js";
import { execute } from "./execute.js";
import { testEnvironment } from "./test.js";

export const sessionCodec: AdapterSessionCodec = {
  deserialize(raw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const sessionId = typeof (raw as Record<string, unknown>).sessionId === "string"
      ? ((raw as Record<string, unknown>).sessionId as string).trim()
      : "";
    if (!sessionId) return null;
    return { sessionId };
  },
  serialize(params) {
    if (!params) return null;
    const sessionId = typeof params.sessionId === "string" ? params.sessionId.trim() : "";
    return sessionId ? { sessionId } : null;
  },
  getDisplayId(params) {
    if (!params) return null;
    return typeof params.sessionId === "string" && params.sessionId.trim().length > 0
      ? params.sessionId.trim()
      : null;
  },
};

export const nanobotLocalAdapter: ServerAdapterModule = {
  type: "nanobot_local",
  execute,
  testEnvironment,
  sessionCodec,
  models: [],
  supportsLocalAgentJwt: true,
  agentConfigurationDoc: `# nanobot local agent configuration

Adapter: nanobot_local

Required fields:
- command (string, optional): nanobot CLI command path. Defaults to "nanobot"
- configPath (string, required): absolute path to the employee's nanobot config.json
- workspace (string, required): absolute path to the employee workspace

Optional fields:
- cwd (string, optional): execution cwd fallback (defaults to workspace)
- promptTemplate (string, optional): extra Paperclip wrapper instructions
- extraArgs (string[] | string, optional): additional CLI args inserted before -m
- env (object, optional): KEY=VALUE environment variables
- timeoutSec (number, optional): run timeout in seconds
- graceSec (number, optional): SIGTERM grace period in seconds
`,
};
