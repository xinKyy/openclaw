import fs from "node:fs";
import path from "node:path";
import { Type, type Static } from "@sinclair/typebox";
import type { OpenClawPluginApi, AnyAgentTool } from "../../api.js";
import { jsonToolResult } from "../tool-result.js";
import type { RoleDefinition } from "../types.js";
import { DEFAULT_ROLES, type RolesConfig } from "./schema.js";

const ROLES_FILE = "roles.json";

class RoleManager {
  private filePath: string;

  constructor(dataDir: string) {
    this.filePath = path.join(dataDir, ROLES_FILE);
    this.ensureFile();
  }

  private ensureFile(): void {
    if (!fs.existsSync(this.filePath)) {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      const initial: RolesConfig = { roles: DEFAULT_ROLES };
      fs.writeFileSync(this.filePath, JSON.stringify(initial, null, 2));
    }
  }

  private read(): RolesConfig {
    return JSON.parse(fs.readFileSync(this.filePath, "utf-8")) as RolesConfig;
  }

  private write(data: RolesConfig): void {
    fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2));
  }

  list(): RoleDefinition[] {
    return this.read().roles;
  }

  get(id: string): RoleDefinition | null {
    return this.read().roles.find((r) => r.id === id) ?? null;
  }

  add(role: RoleDefinition): void {
    const config = this.read();
    if (config.roles.some((r) => r.id === role.id)) {
      throw new Error(`Role "${role.id}" already exists.`);
    }
    config.roles.push(role);
    this.write(config);
  }

  update(id: string, updates: Partial<Omit<RoleDefinition, "id">>): void {
    const config = this.read();
    const idx = config.roles.findIndex((r) => r.id === id);
    if (idx < 0) throw new Error(`Role "${id}" not found.`);
    config.roles[idx] = { ...config.roles[idx], ...updates, id };
    this.write(config);
  }

  remove(id: string): boolean {
    const config = this.read();
    const idx = config.roles.findIndex((r) => r.id === id);
    if (idx < 0) return false;
    config.roles.splice(idx, 1);
    this.write(config);
    return true;
  }

  /**
   * Generate the full OpenClaw config snippet: agents.list, bindings,
   * and channels.telegram.accounts derived from role definitions.
   */
  toFullConfig(): {
    agents: Array<{ id: string; model: string; skills: string[]; workspace?: string }>;
    bindings: Array<{ agentId: string; match: { channel: string; accountId: string } }>;
    telegramAccounts: Record<string, { botToken: string }>;
  } {
    const roles = this.list();
    const agents: Array<{ id: string; model: string; skills: string[]; workspace?: string }> = [];
    const bindings: Array<{
      agentId: string;
      match: { channel: string; accountId: string };
    }> = [];
    const telegramAccounts: Record<string, { botToken: string }> = {};

    for (const r of roles) {
      agents.push({
        id: r.agentId,
        model: r.model,
        skills: r.skills ?? [],
        ...(r.workspace ? { workspace: r.workspace } : {}),
      });

      if (r.telegramBotToken) {
        bindings.push({
          agentId: r.agentId,
          match: { channel: "telegram", accountId: r.agentId },
        });
        telegramAccounts[r.agentId] = { botToken: r.telegramBotToken };
      }
    }

    return { agents, bindings, telegramAccounts };
  }
}

// --- Tool schemas ---

const RoleAddSchema = Type.Object(
  {
    id: Type.String({ description: "Unique role identifier." }),
    name: Type.String({ description: "Display name for the role." }),
    model: Type.Optional(Type.String({ description: "AI model to use. Default: sonnet-4.6." })),
    sopId: Type.Optional(Type.String({ description: "SOP definition ID to bind to this role." })),
    description: Type.String({ description: "What this role is responsible for." }),
    skills: Type.Optional(
      Type.Array(Type.String(), { description: "Skills to assign to this role." }),
    ),
  },
  { additionalProperties: false },
);

const RoleUpdateSchema = Type.Object(
  {
    id: Type.String({ description: "Role ID to update." }),
    name: Type.Optional(Type.String({ description: "New display name." })),
    model: Type.Optional(Type.String({ description: "New AI model." })),
    sopId: Type.Optional(Type.String({ description: "New SOP ID." })),
    description: Type.Optional(Type.String({ description: "New description." })),
    skills: Type.Optional(Type.Array(Type.String(), { description: "New skills list." })),
  },
  { additionalProperties: false },
);

const RoleRemoveSchema = Type.Object(
  { id: Type.String({ description: "Role ID to remove." }) },
  { additionalProperties: false },
);

const RoleGetSchema = Type.Object(
  { id: Type.String({ description: "Role ID to look up." }) },
  { additionalProperties: false },
);

export function registerRoleTools(api: OpenClawPluginApi, dataDir: string): void {
  const mgr = new RoleManager(dataDir);

  api.registerTool(
    () => ({
      name: "role_list",
      label: "Role List",
      description:
        "List all roles in the solo company system with their model, SOP, and skills configuration.",
      parameters: Type.Object({}, { additionalProperties: false }),
      execute: async () => jsonToolResult({ roles: mgr.list() }),
    }),
    { name: "role_list" },
  );

  api.registerTool(
    () => ({
      name: "role_get",
      label: "Role Get",
      description: "Get details of a specific role by ID.",
      parameters: RoleGetSchema,
      execute: async (_id, raw) => {
        const p = raw as Static<typeof RoleGetSchema>;
        const role = mgr.get(p.id);
        if (!role) return jsonToolResult({ error: `Role "${p.id}" not found.` });
        return jsonToolResult(role);
      },
    }),
    { name: "role_get" },
  );

  api.registerTool(
    () => ({
      name: "role_add",
      label: "Role Add",
      description:
        "Add a new role to the solo company system. Each role maps to an agent with a specific model and skill set.",
      parameters: RoleAddSchema,
      execute: async (_id, raw) => {
        const p = raw as Static<typeof RoleAddSchema>;
        try {
          mgr.add({
            id: p.id,
            name: p.name,
            agentId: p.id,
            model: p.model ?? "sonnet-4.6",
            sopId: p.sopId,
            description: p.description,
            skills: p.skills ?? [],
          });
          return jsonToolResult({
            success: true,
            message: `Role "${p.id}" added.`,
            agentConfig: mgr.toFullConfig(),
          });
        } catch (err) {
          return jsonToolResult({ error: err instanceof Error ? err.message : String(err) });
        }
      },
    }),
    { name: "role_add" },
  );

  api.registerTool(
    () => ({
      name: "role_update",
      label: "Role Update",
      description: "Update an existing role's configuration (name, model, SOP, skills).",
      parameters: RoleUpdateSchema,
      execute: async (_id, raw) => {
        const p = raw as Static<typeof RoleUpdateSchema>;
        try {
          const { id, ...updates } = p;
          mgr.update(id, updates);
          return jsonToolResult({ success: true, message: `Role "${id}" updated.` });
        } catch (err) {
          return jsonToolResult({ error: err instanceof Error ? err.message : String(err) });
        }
      },
    }),
    { name: "role_update" },
  );

  api.registerTool(
    () => ({
      name: "role_remove",
      label: "Role Remove",
      description: "Remove a role from the solo company system.",
      parameters: RoleRemoveSchema,
      execute: async (_id, raw) => {
        const p = raw as Static<typeof RoleRemoveSchema>;
        const removed = mgr.remove(p.id);
        if (removed) return jsonToolResult({ success: true, message: `Role "${p.id}" removed.` });
        return jsonToolResult({ error: `Role "${p.id}" not found.` });
      },
    }),
    { name: "role_remove" },
  );
}
