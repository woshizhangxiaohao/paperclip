#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");

function readFile(relativePath) {
  const absolutePath = path.join(repoRoot, relativePath);
  return fs.readFileSync(absolutePath, "utf8");
}

function exists(relativePath) {
  return fs.existsSync(path.join(repoRoot, relativePath));
}

const checks = [
  {
    name: "server adapter registry contains nanobot_local",
    file: "server/src/adapters/registry.ts",
    test: (text) =>
      /import\s*\{\s*nanobotLocalAdapter\s*\}\s*from\s*["']\.\/nanobot-local\/index\.js["']/.test(text) &&
      /const adaptersByType = new Map<string, ServerAdapterModule>\([\s\S]*\bnanobotLocalAdapter\b/.test(text),
  },
  {
    name: "ui adapter registry contains nanobot_local",
    file: "ui/src/adapters/registry.ts",
    test: (text) =>
      /import\s*\{\s*nanobotLocalUIAdapter\s*\}\s*from\s*["']\.\/nanobot-local["']/.test(text) &&
      /const adaptersByType = new Map<string, UIAdapterModule>\([\s\S]*\bnanobotLocalUIAdapter\b/.test(text),
  },
  {
    name: "cli adapter registry contains nanobot_local",
    file: "cli/src/adapters/registry.ts",
    test: (text) =>
      /type:\s*["']nanobot_local["']/.test(text) &&
      /const adaptersByType = new Map<string, CLIAdapterModule>\([\s\S]*\bnanobotLocalCLIAdapter\b/.test(text),
  },
  {
    name: "shared adapter types include nanobot_local",
    file: "packages/shared/src/constants.ts",
    test: (text) => /AGENT_ADAPTER_TYPES[\s\S]*["']nanobot_local["']/.test(text),
  },
  {
    name: "CreateConfigValues includes nanobot fields",
    file: "packages/adapter-utils/src/types.ts",
    test: (text) =>
      /interface CreateConfigValues[\s\S]*configPath\?: string;/.test(text) &&
      /interface CreateConfigValues[\s\S]*workspacePath\?: string;/.test(text),
  },
  {
    name: "agent config form enables nanobot_local",
    file: "ui/src/components/AgentConfigForm.tsx",
    test: (text) => /ENABLED_ADAPTER_TYPES[\s\S]*["']nanobot_local["']/.test(text),
  },
  {
    name: "new agent page supports nanobot_local",
    file: "ui/src/pages/NewAgent.tsx",
    test: (text) => /SUPPORTED_ADVANCED_ADAPTER_TYPES[\s\S]*["']nanobot_local["']/.test(text),
  },
  {
    name: "invite landing enables nanobot_local",
    file: "ui/src/pages/InviteLanding.tsx",
    test: (text) =>
      /const adapterLabels:[\s\S]*\bnanobot_local\s*:/.test(text) &&
      /ENABLED_INVITE_ADAPTERS[\s\S]*["']nanobot_local["']/.test(text),
  },
  {
    name: "org chart label contains nanobot_local",
    file: "ui/src/pages/OrgChart.tsx",
    test: (text) => /const adapterLabels:[\s\S]*\bnanobot_local\s*:/.test(text),
  },
  {
    name: "nanobot server adapter files exist",
    file: null,
    test: () =>
      exists("server/src/adapters/nanobot-local/index.ts") &&
      exists("server/src/adapters/nanobot-local/execute.ts") &&
      exists("server/src/adapters/nanobot-local/test.ts"),
  },
  {
    name: "nanobot ui adapter files exist",
    file: null,
    test: () =>
      exists("ui/src/adapters/nanobot-local/index.ts") &&
      exists("ui/src/adapters/nanobot-local/build-config.ts") &&
      exists("ui/src/adapters/nanobot-local/config-fields.tsx"),
  },
  {
    name: "paperclip-agent-bridge plugin files exist",
    file: null,
    test: () =>
      exists("packages/plugins/paperclip-agent-bridge/package.json") &&
      exists("packages/plugins/paperclip-agent-bridge/src/manifest.js") &&
      exists("packages/plugins/paperclip-agent-bridge/src/worker.js"),
  },
];

const failures = [];

for (const check of checks) {
  try {
    const input = check.file ? readFile(check.file) : "";
    if (!check.test(input)) {
      failures.push(check);
    }
  } catch {
    failures.push(check);
  }
}

if (failures.length > 0) {
  console.error("Company custom integration check failed.\n");
  for (const failure of failures) {
    const location = failure.file ? ` (${failure.file})` : "";
    console.error(`- ${failure.name}${location}`);
  }
  console.error(
    "\nFix the missing integration points, then rerun:\n  pnpm run check:company-custom\n",
  );
  process.exit(1);
}

const bridgePkgPath = path.join(
  repoRoot,
  "packages/plugins/paperclip-agent-bridge/package.json",
);
const bridgePkg = JSON.parse(fs.readFileSync(bridgePkgPath, "utf8"));
if (!bridgePkg?.paperclipPlugin?.manifest || !bridgePkg?.paperclipPlugin?.worker) {
  console.error("Company custom integration check failed.\n");
  console.error("- paperclip-agent-bridge package.json is missing paperclipPlugin manifest/worker");
  process.exit(1);
}

console.log("Company custom integration check passed.");
