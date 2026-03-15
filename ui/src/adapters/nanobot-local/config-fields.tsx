import type { AdapterConfigFieldsProps } from "../types";
import { Field, DraftInput, help } from "../../components/agent-config-primitives";

const inputClass =
  "w-full rounded-md border border-border px-2.5 py-1.5 bg-transparent outline-none text-sm font-mono placeholder:text-muted-foreground/40";

export function NanobotLocalConfigFields({
  isCreate,
  values,
  set,
  config,
  eff,
  mark,
}: AdapterConfigFieldsProps) {
  return (
    <>
      <Field label="Command" hint={help.command}>
        <DraftInput
          value={isCreate ? values!.command : eff("adapterConfig", "command", String(config.command ?? "nanobot"))}
          onCommit={(v) => (isCreate ? set!({ command: v }) : mark("adapterConfig", "command", v || undefined))}
          immediate
          className={inputClass}
          placeholder="e.g. /Users/.../nanobot"
        />
      </Field>
      <Field label="Config path" hint={help.configPath}>
        <DraftInput
          value={isCreate ? values!.configPath ?? "" : eff("adapterConfig", "configPath", String(config.configPath ?? ""))}
          onCommit={(v) => (isCreate ? set!({ configPath: v }) : mark("adapterConfig", "configPath", v || undefined))}
          immediate
          className={inputClass}
          placeholder="/abs/path/to/config.json"
        />
      </Field>
      <Field label="Workspace path" hint={help.workspacePath}>
        <DraftInput
          value={isCreate ? values!.workspacePath ?? values!.cwd : eff("adapterConfig", "workspace", String(config.workspace ?? config.cwd ?? ""))}
          onCommit={(v) =>
            isCreate
              ? set!({ workspacePath: v, cwd: v })
              : mark("adapterConfig", "workspace", v || undefined)
          }
          immediate
          className={inputClass}
          placeholder="/abs/path/to/employee/workspace"
        />
      </Field>
    </>
  );
}
