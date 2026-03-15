import type { UIAdapterModule } from "../types";
import { parseProcessStdoutLine } from "../process/parse-stdout";
import { NanobotLocalConfigFields } from "./config-fields";
import { buildNanobotLocalConfig } from "./build-config";

export const nanobotLocalUIAdapter: UIAdapterModule = {
  type: "nanobot_local",
  label: "Nanobot (local)",
  parseStdoutLine: parseProcessStdoutLine,
  ConfigFields: NanobotLocalConfigFields,
  buildAdapterConfig: buildNanobotLocalConfig,
};
