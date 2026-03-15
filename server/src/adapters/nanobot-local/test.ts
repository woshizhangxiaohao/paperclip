import type {
  AdapterEnvironmentCheck,
  AdapterEnvironmentTestContext,
  AdapterEnvironmentTestResult,
} from "../types.js";
import {
  asString,
  parseObject,
  ensureAbsoluteDirectory,
  ensureCommandResolvable,
  ensurePathInEnv,
} from "../utils.js";
import fs from "node:fs/promises";

function summarizeStatus(checks: AdapterEnvironmentCheck[]): AdapterEnvironmentTestResult["status"] {
  if (checks.some((check) => check.level === "error")) return "fail";
  if (checks.some((check) => check.level === "warn")) return "warn";
  return "pass";
}

async function ensureFile(candidate: string) {
  const stat = await fs.stat(candidate);
  if (!stat.isFile()) {
    throw new Error(`Expected file but found something else: ${candidate}`);
  }
}

export async function testEnvironment(
  ctx: AdapterEnvironmentTestContext,
): Promise<AdapterEnvironmentTestResult> {
  const checks: AdapterEnvironmentCheck[] = [];
  const config = parseObject(ctx.config);
  const command = asString(config.command, "nanobot");
  const workspace = asString(config.workspace, asString(config.cwd, process.cwd()));
  const configPath = asString(config.configPath, "");

  checks.push({
    code: "nanobot_command_present",
    level: "info",
    message: `Configured command: ${command}`,
  });

  try {
    await ensureAbsoluteDirectory(workspace);
    checks.push({
      code: "nanobot_workspace_valid",
      level: "info",
      message: `Workspace is valid: ${workspace}`,
    });
  } catch (err) {
    checks.push({
      code: "nanobot_workspace_invalid",
      level: "error",
      message: err instanceof Error ? err.message : "Invalid workspace directory",
      detail: workspace,
    });
  }

  if (!configPath) {
    checks.push({
      code: "nanobot_config_missing",
      level: "error",
      message: "nanobot_local requires adapterConfig.configPath.",
      hint: "Point configPath at the employee's config/config.json file.",
    });
  } else {
    try {
      await ensureFile(configPath);
      checks.push({
        code: "nanobot_config_valid",
        level: "info",
        message: `Config file is valid: ${configPath}`,
      });
    } catch (err) {
      checks.push({
        code: "nanobot_config_invalid",
        level: "error",
        message: err instanceof Error ? err.message : "Invalid nanobot config file",
        detail: configPath,
      });
    }
  }

  const envConfig = parseObject(config.env);
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(envConfig)) {
    if (typeof value === "string") env[key] = value;
  }
  const runtimeEnv = ensurePathInEnv({ ...process.env, ...env });
  try {
    await ensureCommandResolvable(command, workspace, runtimeEnv);
    checks.push({
      code: "nanobot_command_resolvable",
      level: "info",
      message: `Command is executable: ${command}`,
    });
  } catch (err) {
    checks.push({
      code: "nanobot_command_unresolvable",
      level: "error",
      message: err instanceof Error ? err.message : "Command is not executable",
      detail: command,
    });
  }

  return {
    adapterType: ctx.adapterType,
    status: summarizeStatus(checks),
    checks,
    testedAt: new Date().toISOString(),
  };
}
