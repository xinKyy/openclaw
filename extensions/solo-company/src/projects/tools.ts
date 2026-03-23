import { Type, type Static } from "@sinclair/typebox";
import type { OpenClawPluginApi, AnyAgentTool } from "../../api.js";
import { jsonToolResult } from "../tool-result.js";
import { ProjectRegistryManager } from "./registry.js";

const ProjectGetSchema = Type.Object(
  {
    id: Type.String({ description: "Project ID or alias to look up." }),
  },
  { additionalProperties: false },
);

const ProjectAddSchema = Type.Object(
  {
    id: Type.String({ description: "Unique project identifier." }),
    repo: Type.String({ description: "Git repository URL." }),
    aliases: Type.Optional(
      Type.Array(Type.String(), { description: "Alternative names for the project." }),
    ),
    default_branch: Type.String({ description: "Production branch name." }),
    dev_branch: Type.String({ description: "Development branch name." }),
    branches: Type.Optional(
      Type.Object(
        {},
        { description: "Branch name to description mapping.", additionalProperties: true },
      ),
    ),
    description: Type.String({ description: "Project description." }),
    jenkins_job: Type.Optional(Type.String({ description: "Jenkins job name for deployment." })),
  },
  { additionalProperties: false },
);

const ProjectUpdateSchema = Type.Object(
  {
    id: Type.String({ description: "Project ID to update." }),
    repo: Type.Optional(Type.String({ description: "New Git repository URL." })),
    aliases: Type.Optional(Type.Array(Type.String(), { description: "Updated aliases." })),
    default_branch: Type.Optional(Type.String({ description: "Updated production branch." })),
    dev_branch: Type.Optional(Type.String({ description: "Updated dev branch." })),
    description: Type.Optional(Type.String({ description: "Updated description." })),
    jenkins_job: Type.Optional(Type.String({ description: "Updated Jenkins job name." })),
  },
  { additionalProperties: false },
);

const ProjectRemoveSchema = Type.Object(
  {
    id: Type.String({ description: "Project ID to remove." }),
  },
  { additionalProperties: false },
);

export function registerProjectTools(api: OpenClawPluginApi, dataDir: string): void {
  const registry = new ProjectRegistryManager(dataDir);

  api.registerTool(() => createProjectListTool(registry), { name: "project_list" });
  api.registerTool(() => createProjectGetTool(registry), { name: "project_get" });
  api.registerTool(() => createProjectAddTool(registry), { name: "project_add" });
  api.registerTool(() => createProjectUpdateTool(registry), { name: "project_update" });
  api.registerTool(() => createProjectRemoveTool(registry), { name: "project_remove" });
}

function createProjectListTool(registry: ProjectRegistryManager): AnyAgentTool {
  return {
    name: "project_list",
    label: "Project List",
    description: "List all registered projects with their configuration details.",
    parameters: Type.Object({}, { additionalProperties: false }),
    execute: async () => {
      const projects = registry.list();
      return jsonToolResult({ projects });
    },
  };
}

function createProjectGetTool(registry: ProjectRegistryManager): AnyAgentTool {
  return {
    name: "project_get",
    label: "Project Get",
    description:
      "Get project details by ID or alias. Returns repo URL, branches, Jenkins job, etc.",
    parameters: ProjectGetSchema,
    execute: async (_id, raw) => {
      const p = raw as Static<typeof ProjectGetSchema>;
      const result = registry.get(p.id);
      if (!result) {
        return jsonToolResult({ error: `Project "${p.id}" not found.` });
      }
      return jsonToolResult({ id: result.id, ...result.project });
    },
  };
}

function createProjectAddTool(registry: ProjectRegistryManager): AnyAgentTool {
  return {
    name: "project_add",
    label: "Project Add",
    description: "Add a new project to the registry.",
    parameters: ProjectAddSchema,
    execute: async (_id, raw) => {
      const p = raw as Static<typeof ProjectAddSchema>;
      try {
        registry.add(p.id, {
          repo: p.repo,
          aliases: p.aliases ?? [],
          default_branch: p.default_branch,
          dev_branch: p.dev_branch,
          branches: (p.branches ?? {}) as Record<string, string>,
          description: p.description,
          jenkins_job: p.jenkins_job ?? "",
        });
        return jsonToolResult({ success: true, message: `Project "${p.id}" added.` });
      } catch (err) {
        return jsonToolResult({ error: err instanceof Error ? err.message : String(err) });
      }
    },
  };
}

function createProjectUpdateTool(registry: ProjectRegistryManager): AnyAgentTool {
  return {
    name: "project_update",
    label: "Project Update",
    description: "Update an existing project's configuration.",
    parameters: ProjectUpdateSchema,
    execute: async (_id, raw) => {
      const p = raw as Static<typeof ProjectUpdateSchema>;
      try {
        const { id, ...updates } = p;
        registry.update(id, updates);
        return jsonToolResult({ success: true, message: `Project "${id}" updated.` });
      } catch (err) {
        return jsonToolResult({ error: err instanceof Error ? err.message : String(err) });
      }
    },
  };
}

function createProjectRemoveTool(registry: ProjectRegistryManager): AnyAgentTool {
  return {
    name: "project_remove",
    label: "Project Remove",
    description: "Remove a project from the registry.",
    parameters: ProjectRemoveSchema,
    execute: async (_id, raw) => {
      const p = raw as Static<typeof ProjectRemoveSchema>;
      const removed = registry.remove(p.id);
      if (removed) {
        return jsonToolResult({ success: true, message: `Project "${p.id}" removed.` });
      }
      return jsonToolResult({ error: `Project "${p.id}" not found.` });
    },
  };
}
