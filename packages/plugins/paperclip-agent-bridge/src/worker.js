import { definePlugin, runWorker } from "../../sdk/src/index.ts";

const TOOL_NAME = "contact-agent";
const DEFAULT_WAIT_MS = 90_000;

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function pickTargetAgent(agents, params) {
  const targetId = normalizeText(params.targetAgentId);
  const targetName = normalizeText(params.targetAgentName);

  if (targetId) {
    return agents.find((agent) => agent.id === targetId) ?? null;
  }

  if (!targetName) {
    return null;
  }

  const exactMatches = agents.filter((agent) => agent.name === targetName);
  if (exactMatches.length === 1) return exactMatches[0];
  if (exactMatches.length > 1) {
    throw new Error(`Target agent name "${targetName}" is ambiguous.`);
  }

  const caseInsensitive = agents.filter((agent) => normalizeText(agent.name).toLowerCase() === targetName.toLowerCase());
  if (caseInsensitive.length === 1) return caseInsensitive[0];
  if (caseInsensitive.length > 1) {
    throw new Error(`Target agent name "${targetName}" is ambiguous.`);
  }

  return null;
}

function waitForSessionReply(ctx, sessionId, companyId, prompt, reason) {
  return new Promise(async (resolve, reject) => {
    const chunks = [];
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error("Timed out waiting for target agent reply."));
    }, DEFAULT_WAIT_MS);

    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn(value);
    };

    try {
      await ctx.agents.sessions.sendMessage(sessionId, companyId, {
        prompt,
        reason,
        onEvent: (event) => {
          if (event.eventType === "chunk" && event.message) {
            chunks.push(event.message);
            return;
          }
          if (event.eventType === "done") {
            finish(resolve, chunks.join("").trim());
            return;
          }
          if (event.eventType === "error") {
            finish(reject, new Error(event.message || "Target agent session returned an error."));
          }
        }
      });
    } catch (error) {
      finish(reject, error);
    }
  });
}

const plugin = definePlugin({
  async setup(ctx) {
    ctx.tools.register(
      TOOL_NAME,
      {
        displayName: "Contact Agent",
        description: "Contact another Paperclip agent and return that agent's reply.",
        parametersSchema: {
          type: "object",
          properties: {
            targetAgentName: { type: "string" },
            targetAgentId: { type: "string" },
            prompt: { type: "string" },
            forceFreshSession: { type: "boolean" }
          },
          required: ["prompt"]
        }
      },
      async (params, runCtx) => {
        const payload = params ?? {};
        const prompt = normalizeText(payload.prompt);
        if (!prompt) {
          return { error: "prompt is required" };
        }

        const agents = await ctx.agents.list({ companyId: runCtx.companyId, limit: 200, offset: 0 });
        const targetAgent = pickTargetAgent(agents, payload);
        if (!targetAgent) {
          return { error: "Target agent not found. Provide targetAgentName or targetAgentId." };
        }
        if (targetAgent.id === runCtx.agentId) {
          return { error: "Target agent cannot be the same as the caller." };
        }
        if (targetAgent.status === "pending_approval") {
          return { error: `Target agent ${targetAgent.name} is still pending_approval in Paperclip.` };
        }
        if (targetAgent.status === "terminated") {
          return { error: `Target agent ${targetAgent.name} is terminated in Paperclip.` };
        }

        const caller = agents.find((agent) => agent.id === runCtx.agentId);
        const forceFreshSession = payload.forceFreshSession === true;
        const existingSessions = forceFreshSession ? [] : await ctx.agents.sessions.list(targetAgent.id, runCtx.companyId);
        const session = existingSessions[0] ?? await ctx.agents.sessions.create(targetAgent.id, runCtx.companyId, {
          reason: caller ? `${caller.name} contacting ${targetAgent.name}` : `Contacting ${targetAgent.name}`
        });

        const reply = await waitForSessionReply(
          ctx,
          session.sessionId,
          runCtx.companyId,
          prompt,
          caller ? `${caller.name} -> ${targetAgent.name}` : `Agent -> ${targetAgent.name}`
        );

        return {
          content: reply && reply.length > 0
            ? `已联系 ${targetAgent.name}。\n\n${reply}`
            : `已联系 ${targetAgent.name}，但对方没有返回可见文本。`,
          data: {
            targetAgentId: targetAgent.id,
            targetAgentName: targetAgent.name,
            sessionId: session.sessionId,
            reusedSession: existingSessions.length > 0
          }
        };
      }
    );
  }
});

export default plugin;
runWorker(plugin, import.meta.url);
