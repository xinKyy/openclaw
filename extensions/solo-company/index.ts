import os from "node:os";
import path from "node:path";
import { definePluginEntry, type OpenClawPluginApi } from "./api.js";
import { initDatabase } from "./src/db/init.js";
import { registerGatewayMethods } from "./src/gateway-methods/solo-company.js";
import { registerMessageHook, registerMessageTools } from "./src/messages/store.js";
import { registerProjectTools } from "./src/projects/tools.js";
import { registerRoleTools } from "./src/roles/manager.js";
import { registerSopTools } from "./src/sop/tools.js";
import type { SoloCompanyConfig } from "./src/types.js";

function resolveDataDir(config: SoloCompanyConfig): string {
  return config.dataDir || path.join(os.homedir(), ".openclaw", "solo-company");
}

export default definePluginEntry({
  id: "solo-company",
  name: "Solo Company",
  description: "One-person company multi-role AI collaboration system.",
  register(api: OpenClawPluginApi) {
    const config = (api.pluginConfig ?? {}) as SoloCompanyConfig;
    const dataDir = resolveDataDir(config);
    const db = initDatabase(dataDir);

    registerMessageHook(api, db);
    registerMessageTools(api, db);
    registerProjectTools(api, dataDir);
    registerSopTools(api, db, dataDir);
    registerRoleTools(api, dataDir);
    registerGatewayMethods(api, db, dataDir);
  },
});
