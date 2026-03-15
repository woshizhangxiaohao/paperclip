import { joinPromptSections } from "@paperclipai/adapter-utils/server-utils";
import type { AdapterExecutionContext, AdapterExecutionResult } from "../types.js";
import {
  asNumber,
  asString,
  asStringArray,
  buildPaperclipEnv,
  ensureAbsoluteDirectory,
  ensureCommandResolvable,
  ensurePathInEnv,
  parseObject,
  redactEnvForLogs,
  renderTemplate,
  runChildProcess,
} from "../utils.js";

type HeartbeatIssueContext = {
  issue?: {
    identifier?: string;
    title?: string;
    description?: string | null;
    status?: string;
    priority?: string;
  } | null;
  ancestors?: Array<{
    identifier?: string;
    title?: string;
    status?: string;
  }>;
  project?: {
    name?: string;
    status?: string;
  } | null;
  goal?: {
    title?: string;
    status?: string;
  } | null;
  wakeComment?: {
    bodyMarkdown?: string | null;
    bodyText?: string | null;
  } | null;
};

function readNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function sanitizeSessionId(value: string) {
  return value.replace(/[^a-zA-Z0-9:_-]/g, "-").slice(0, 180);
}

function resolveSessionId(ctx: AdapterExecutionContext): string {
  const runtimeParams = parseObject(ctx.runtime.sessionParams);
  const candidates = [
    readNonEmptyString(runtimeParams.sessionId),
    readNonEmptyString(ctx.runtime.sessionDisplayId),
    readNonEmptyString(ctx.runtime.sessionId),
    readNonEmptyString(ctx.runtime.taskKey),
    readNonEmptyString(ctx.context.taskKey),
    readNonEmptyString(ctx.context.issueId),
    ctx.runId,
  ];
  for (const candidate of candidates) {
    if (candidate) return sanitizeSessionId(candidate);
  }
  return sanitizeSessionId(ctx.runId);
}

function stripNanobotNoise(text: string): string {
  const isNoiseLine = (trimmed: string) => {
    if (!trimmed) return true;
    if (trimmed.startsWith("Using config:")) return true;
    if (trimmed.startsWith("Using workspace:")) return true;
    if (trimmed.startsWith("Starting in agent mode")) return true;
    if (trimmed.startsWith("run started")) return true;
    if (trimmed.startsWith("adapter invocation")) return true;
    if (trimmed.startsWith("[paperclip]")) return true;
    if (trimmed.startsWith("Hint: Detected deprecated")) return true;
    if (trimmed.includes("`memoryWindow` is ignored")) return true;
    if (trimmed.startsWith("🐈")) return true;
    if (trimmed.startsWith("/Users/")) return true;
    if (trimmed.endsWith("/config/config.json")) return true;
    if (trimmed === "json") return true;
    return false;
  };

  return text
    .split(/\r?\n/)
    .filter((line) => {
      const trimmed = line.trim();
      return !isNoiseLine(trimmed);
    })
    .join("\n")
    .trim();
}

function firstNonEmptyLine(text: string): string | null {
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed) return trimmed;
  }
  return null;
}

async function fetchIssueContext(
  apiUrl: string,
  authToken: string | undefined,
  issueId: string | null,
  wakeCommentId: string | null,
): Promise<HeartbeatIssueContext | null> {
  if (!issueId) return null;
  const url = new URL(`/api/issues/${encodeURIComponent(issueId)}/heartbeat-context`, apiUrl);
  if (wakeCommentId) url.searchParams.set("wakeCommentId", wakeCommentId);
  const headers: Record<string, string> = {};
  if (authToken) headers.Authorization = `Bearer ${authToken}`;
  try {
    const response = await fetch(url, { headers });
    if (!response.ok) return null;
    return (await response.json()) as HeartbeatIssueContext;
  } catch {
    return null;
  }
}

function formatIssueContextMarkdown(data: HeartbeatIssueContext | null): string {
  if (!data?.issue) return "";
  const parts: string[] = [];
  const issueLine = [data.issue.identifier, data.issue.title].filter(Boolean).join(" - ");
  if (issueLine) parts.push(`# Assigned issue\n${issueLine}`);
  const meta: string[] = [];
  if (data.issue.status) meta.push(`Status: ${data.issue.status}`);
  if (data.issue.priority) meta.push(`Priority: ${data.issue.priority}`);
  if (data.project?.name) meta.push(`Project: ${data.project.name}${data.project.status ? ` (${data.project.status})` : ""}`);
  if (data.goal?.title) meta.push(`Goal: ${data.goal.title}${data.goal.status ? ` (${data.goal.status})` : ""}`);
  if (meta.length > 0) parts.push(meta.join("\n"));
  if (readNonEmptyString(data.issue.description)) {
    parts.push(`## Issue description\n${data.issue.description}`);
  }
  if (Array.isArray(data.ancestors) && data.ancestors.length > 0) {
    parts.push(
      `## Parent chain\n${data.ancestors
        .map((ancestor) => `- ${[ancestor.identifier, ancestor.title].filter(Boolean).join(" - ")}${ancestor.status ? ` (${ancestor.status})` : ""}`)
        .join("\n")}`,
    );
  }
  const wakeComment = readNonEmptyString(data.wakeComment?.bodyMarkdown) ?? readNonEmptyString(data.wakeComment?.bodyText);
  if (wakeComment) {
    parts.push(`## Latest wake comment\n${wakeComment}`);
  }
  return parts.join("\n\n").trim();
}

export async function execute(ctx: AdapterExecutionContext): Promise<AdapterExecutionResult> {
  const { runId, agent, runtime, config, context, onLog, onMeta, authToken } = ctx;

  const command = asString(config.command, "nanobot");
  const configPath = asString(config.configPath, "");
  const workspace = asString(config.workspace, asString(config.cwd, process.cwd()));
  const promptTemplate = asString(
    config.promptTemplate,
    "You are {{agent.name}}. This wake came from Paperclip. Read the provided wake request, issue context, and handoff, then continue the assigned work. Reply with the concrete result or next blocking need only.",
  );
  const extraArgs = asStringArray(config.extraArgs);
  const timeoutSec = asNumber(config.timeoutSec, 0);
  const graceSec = asNumber(config.graceSec, 15);
  const envConfig = parseObject(config.env);

  if (!configPath) {
    throw new Error("nanobot_local missing configPath");
  }

  await ensureAbsoluteDirectory(workspace, { createIfMissing: false });

  const wakePrompt = asString(context.paperclipWakePrompt, "").trim();
  const issueId = readNonEmptyString(context.issueId);
  const wakeCommentId = readNonEmptyString(context.wakeCommentId) ?? readNonEmptyString(context.commentId);
  const issueContext = await fetchIssueContext(
    process.env.PAPERCLIP_API_URL ?? buildPaperclipEnv(agent).PAPERCLIP_API_URL,
    authToken,
    issueId,
    wakeCommentId,
  );
  const issueMarkdown = formatIssueContextMarkdown(issueContext);
  const sessionHandoff = asString(context.paperclipSessionHandoffMarkdown, "").trim();
  const templateData = {
    agentId: agent.id,
    companyId: agent.companyId,
    runId,
    company: { id: agent.companyId },
    agent,
    run: { id: runId, source: asString(context.wakeSource, "on_demand") },
    context,
  };
  const renderedPrompt = renderTemplate(promptTemplate, templateData).trim();
  const prompt = joinPromptSections([
    wakePrompt ? `# Direct wake request\n${wakePrompt}` : "",
    issueMarkdown,
    sessionHandoff ? `# Previous session handoff\n${sessionHandoff}` : "",
    renderedPrompt,
  ]);

  const env: Record<string, string> = { ...buildPaperclipEnv(agent) };
  env.PAPERCLIP_RUN_ID = runId;
  if (issueId) env.PAPERCLIP_TASK_ID = issueId;
  const wakeReason = readNonEmptyString(context.paperclipWakeReason) ?? readNonEmptyString(context.wakeReason);
  if (wakeReason) env.PAPERCLIP_WAKE_REASON = wakeReason;
  if (authToken && !readNonEmptyString(envConfig.PAPERCLIP_API_KEY)) {
    env.PAPERCLIP_API_KEY = authToken;
  }
  for (const [key, value] of Object.entries(envConfig)) {
    if (typeof value === "string") env[key] = value;
  }
  const runtimeEnv = ensurePathInEnv({ ...process.env, ...env });
  await ensureCommandResolvable(command, workspace, runtimeEnv);

  const sessionId = resolveSessionId(ctx);
  const args = [
    "agent",
    "--config",
    configPath,
    "--workspace",
    workspace,
    "--session",
    sessionId,
    "--no-markdown",
    ...extraArgs,
    "-m",
    prompt,
  ];

  if (onMeta) {
    await onMeta({
      adapterType: "nanobot_local",
      command,
      cwd: workspace,
      commandArgs: args.map((value, idx) => {
        if (idx === args.length - 1) return `<prompt ${prompt.length} chars>`;
        return value;
      }),
      env: redactEnvForLogs(env),
      prompt,
      promptMetrics: {
        promptChars: prompt.length,
        wakePromptChars: wakePrompt.length,
        issueContextChars: issueMarkdown.length,
        sessionHandoffChars: sessionHandoff.length,
      },
      context: {
        issueId,
        wakeCommentId,
        taskKey: readNonEmptyString(runtime.taskKey) ?? readNonEmptyString(context.taskKey),
        sessionId,
      },
    });
  }

  const proc = await runChildProcess(runId, command, args, {
    cwd: workspace,
    env,
    timeoutSec,
    graceSec,
    onLog,
  });

  const cleanedStdout = stripNanobotNoise(proc.stdout);
  const cleanedStderr = stripNanobotNoise(proc.stderr);

  if (proc.timedOut) {
    return {
      exitCode: proc.exitCode,
      signal: proc.signal,
      timedOut: true,
      errorMessage: `Timed out after ${timeoutSec}s`,
      sessionId,
      sessionParams: { sessionId },
      sessionDisplayId: sessionId,
      provider: "nanobot",
      billingType: "unknown",
      resultJson: {
        stdout: cleanedStdout,
        stderr: cleanedStderr,
      },
    };
  }

  if ((proc.exitCode ?? 0) !== 0) {
    return {
      exitCode: proc.exitCode,
      signal: proc.signal,
      timedOut: false,
      errorMessage:
        firstNonEmptyLine(cleanedStderr) ??
        firstNonEmptyLine(cleanedStdout) ??
        `nanobot exited with code ${proc.exitCode ?? -1}`,
      provider: "nanobot",
      billingType: "unknown",
      sessionId,
      sessionParams: { sessionId },
      sessionDisplayId: sessionId,
      resultJson: {
        stdout: cleanedStdout,
        stderr: cleanedStderr,
      },
    };
  }

  return {
    exitCode: proc.exitCode,
    signal: proc.signal,
    timedOut: false,
    sessionId,
    sessionParams: { sessionId },
    sessionDisplayId: sessionId,
    provider: "nanobot",
    billingType: "unknown",
    summary: firstNonEmptyLine(cleanedStdout) ?? "nanobot run completed",
    resultJson: {
      stdout: cleanedStdout,
      stderr: cleanedStderr,
    },
  };
}
