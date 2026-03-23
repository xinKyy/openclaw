import fs from "node:fs";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";
import {
  type OpenClawPluginApi,
  readConfigFileSnapshotForWrite,
  writeConfigFile,
} from "../../api.js";
import { ProjectRegistryManager } from "../projects/registry.js";
import { SopEngine } from "../sop/engine.js";
import type { RoleDefinition } from "../types.js";

/**
 * Register gateway WebSocket methods that the Web UI calls.
 * Methods follow the pattern: soloCompany.<resource>.<action>
 */
export function registerGatewayMethods(
  api: OpenClawPluginApi,
  db: DatabaseSync,
  dataDir: string,
): void {
  const projectRegistry = new ProjectRegistryManager(dataDir);
  const sopEngine = new SopEngine(db, dataDir);

  // --- Roles ---
  api.registerGatewayMethod("soloCompany.roles.list", async ({ respond }) => {
    const filePath = path.join(dataDir, "roles.json");
    if (!fs.existsSync(filePath)) {
      respond(true, { roles: [] });
      return;
    }
    const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    respond(true, data);
  });

  api.registerGatewayMethod("soloCompany.roles.save", async ({ params, respond }) => {
    const filePath = path.join(dataDir, "roles.json");
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(params, null, 2));
    respond(true, { ok: true });
  });

  // Apply role config to OpenClaw: writes agents.list, bindings, channels.telegram.accounts
  api.registerGatewayMethod("soloCompany.roles.applyConfig", async ({ respond }) => {
    try {
      const filePath = path.join(dataDir, "roles.json");
      if (!fs.existsSync(filePath)) {
        respond(false, undefined, { code: "NO_ROLES", message: "No roles configured." });
        return;
      }
      const rolesData = JSON.parse(fs.readFileSync(filePath, "utf-8")) as {
        roles: RoleDefinition[];
      };
      const roles = rolesData.roles ?? [];

      const { snapshot, writeOptions } = await readConfigFileSnapshotForWrite();
      const cfg = structuredClone(snapshot.config ?? {}) as Record<string, unknown>;

      // Build agents.list
      const agentsList = roles.map((r) => ({
        id: r.agentId,
        ...(r.workspace ? { workspace: r.workspace } : {}),
        ...(r.model ? { model: r.model } : {}),
      }));

      // Build bindings for roles with telegram tokens
      const bindings = roles
        .filter((r) => r.telegramBotToken)
        .map((r) => ({
          agentId: r.agentId,
          match: { channel: "telegram", accountId: r.agentId },
        }));

      // Build telegram accounts
      const telegramAccounts: Record<string, { botToken: string }> = {};
      for (const r of roles) {
        if (r.telegramBotToken) {
          telegramAccounts[r.agentId] = { botToken: r.telegramBotToken };
        }
      }

      // Merge into config
      const agents = (cfg.agents ?? {}) as Record<string, unknown>;
      agents.list = agentsList;
      cfg.agents = agents;

      cfg.bindings = bindings;

      if (Object.keys(telegramAccounts).length > 0) {
        const channels = (cfg.channels ?? {}) as Record<string, unknown>;
        const telegram = (channels.telegram ?? {}) as Record<string, unknown>;
        telegram.accounts = telegramAccounts;
        channels.telegram = telegram;
        cfg.channels = channels;
      }

      await writeConfigFile(cfg as never, writeOptions);
      respond(true, {
        ok: true,
        agents: agentsList.length,
        bindings: bindings.length,
        telegramAccounts: Object.keys(telegramAccounts).length,
      });
    } catch (err) {
      respond(false, undefined, {
        code: "INTERNAL",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // --- Projects ---
  api.registerGatewayMethod("soloCompany.projects.list", async ({ respond }) => {
    respond(true, { projects: projectRegistry.list() });
  });

  api.registerGatewayMethod("soloCompany.projects.get", async ({ params, respond }) => {
    const result = projectRegistry.get(params.id as string);
    if (result) {
      respond(true, result);
    } else {
      respond(false, undefined, { code: "NOT_FOUND", message: "Not found" });
    }
  });

  api.registerGatewayMethod("soloCompany.projects.save", async ({ params, respond }) => {
    const { id, ...project } = params as Record<string, unknown>;
    try {
      const existing = projectRegistry.get(id as string);
      if (existing) {
        projectRegistry.update(id as string, project);
      } else {
        projectRegistry.add(id as string, project as never);
      }
      respond(true, { ok: true });
    } catch (err) {
      respond(false, undefined, {
        code: "INTERNAL",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  });

  api.registerGatewayMethod("soloCompany.projects.remove", async ({ params, respond }) => {
    const removed = projectRegistry.remove(params.id as string);
    respond(true, { ok: removed });
  });

  // --- Messages ---
  api.registerGatewayMethod("soloCompany.messages.query", async ({ params, respond }) => {
    const conditions: string[] = [];
    const values: unknown[] = [];
    const p = params as Record<string, unknown>;

    if (p.group_id) {
      conditions.push("group_id = ?");
      values.push(p.group_id);
    }
    if (p.channel) {
      conditions.push("channel = ?");
      values.push(p.channel);
    }
    if (p.sender) {
      conditions.push("sender = ?");
      values.push(p.sender);
    }
    if (p.keyword) {
      conditions.push("content LIKE ?");
      values.push(`%${p.keyword}%`);
    }
    if (p.date) {
      conditions.push("date(created_at) = ?");
      values.push(p.date);
    }
    if (p.date_from) {
      conditions.push("created_at >= datetime(?)");
      values.push(`${p.date_from} 00:00:00`);
    }
    if (p.date_to) {
      conditions.push("created_at <= datetime(?)");
      values.push(`${p.date_to} 23:59:59`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const limit = Math.min(Number(p.limit) || 50, 500);
    const offset = Number(p.offset) || 0;

    const sql = `SELECT msg_id, channel, group_id, group_name, sender, sender_name, content, chat_type, thread_id, created_at FROM channel_messages ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`;
    values.push(limit, offset);

    const sqlValues = values as Array<string | number | null>;
    const rows = db.prepare(sql).all(...sqlValues);
    const countSql = `SELECT COUNT(*) as total FROM channel_messages ${where}`;
    const countValues = sqlValues.slice(0, -2);
    const totalRow = db.prepare(countSql).get(...countValues) as { total: number } | undefined;

    respond(true, { messages: rows, total: totalRow?.total ?? 0 });
  });

  api.registerGatewayMethod("soloCompany.messages.stats", async ({ params, respond }) => {
    const conditions: string[] = [];
    const values: unknown[] = [];
    const p = params as Record<string, unknown>;

    if (p.group_id) {
      conditions.push("group_id = ?");
      values.push(p.group_id);
    }
    if (p.channel) {
      conditions.push("channel = ?");
      values.push(p.channel);
    }
    if (p.date) {
      conditions.push("date(created_at) = ?");
      values.push(p.date);
    }
    if (p.date_from) {
      conditions.push("created_at >= datetime(?)");
      values.push(`${p.date_from} 00:00:00`);
    }
    if (p.date_to) {
      conditions.push("created_at <= datetime(?)");
      values.push(`${p.date_to} 23:59:59`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const sql = `SELECT channel, group_id, group_name, COUNT(*) as message_count, MIN(created_at) as earliest, MAX(created_at) as latest FROM channel_messages ${where} GROUP BY channel, group_id ORDER BY message_count DESC`;
    const rows = db.prepare(sql).all(...(values as Array<string | number | null>));
    respond(true, { groups: rows });
  });

  // --- SOP ---
  api.registerGatewayMethod("soloCompany.sop.listDefinitions", async ({ respond }) => {
    respond(true, { definitions: sopEngine.listDefinitions() });
  });

  api.registerGatewayMethod("soloCompany.sop.getDefinition", async ({ params, respond }) => {
    const def = sopEngine.getDefinition(params.id as string);
    if (def) {
      respond(true, def);
    } else {
      respond(false, undefined, { code: "NOT_FOUND", message: "Not found" });
    }
  });

  api.registerGatewayMethod("soloCompany.sop.saveDefinition", async ({ params, respond }) => {
    try {
      const { validateSopDefinition } = await import("../sop/schema.js");
      const def = validateSopDefinition(params);
      sopEngine.saveDefinition(def);
      respond(true, { ok: true, definition: def });
    } catch (err) {
      respond(false, undefined, {
        code: "INTERNAL",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  });

  api.registerGatewayMethod("soloCompany.sop.deleteDefinition", async ({ params, respond }) => {
    const deleted = sopEngine.deleteDefinition(params.id as string);
    respond(true, { ok: deleted });
  });

  api.registerGatewayMethod("soloCompany.sop.listTasks", async ({ params, respond }) => {
    const tasks = sopEngine.listTasks(params.agent_id as string | undefined);
    respond(true, { tasks });
  });

  api.registerGatewayMethod("soloCompany.sop.getTask", async ({ params, respond }) => {
    const task = sopEngine.getTask(params.id as string);
    if (!task) {
      respond(false, undefined, { code: "NOT_FOUND", message: "Not found" });
      return;
    }
    const stepLogs = sopEngine.getTaskStepLogs(task.id);
    const currentStep = sopEngine.getCurrentStepInfo(task.id);
    respond(true, { task, stepLogs, currentStep });
  });
}
