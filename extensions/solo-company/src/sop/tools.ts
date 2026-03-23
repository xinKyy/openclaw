import type { DatabaseSync } from "node:sqlite";
import { Type, type Static } from "@sinclair/typebox";
import type { OpenClawPluginApi, AnyAgentTool } from "../../api.js";
import { jsonToolResult } from "../tool-result.js";
import { SopEngine } from "./engine.js";

const SopStartSchema = Type.Object(
  {
    sop_id: Type.String({
      description: "SOP definition ID to start (e.g. 'dev-default', 'pm-default').",
    }),
    project_id: Type.Optional(Type.String({ description: "Project ID this task relates to." })),
    context: Type.Optional(
      Type.String({ description: "JSON string with additional context for the task." }),
    ),
  },
  { additionalProperties: false },
);

const SopStatusSchema = Type.Object(
  {
    task_id: Type.Optional(
      Type.String({ description: "Specific task ID to check. If omitted, lists recent tasks." }),
    ),
    agent_id: Type.Optional(Type.String({ description: "Filter tasks by agent ID." })),
  },
  { additionalProperties: false },
);

const SopNextSchema = Type.Object(
  {
    task_id: Type.String({ description: "Task ID to advance to the next step." }),
    output: Type.Optional(
      Type.String({ description: "JSON string with output/result from the completed step." }),
    ),
  },
  { additionalProperties: false },
);

const SopCompleteStepSchema = Type.Object(
  {
    task_id: Type.String({ description: "Task ID whose current step to mark as completed." }),
    output: Type.Optional(Type.String({ description: "JSON string with step output." })),
  },
  { additionalProperties: false },
);

const SopFailSchema = Type.Object(
  {
    task_id: Type.String({ description: "Task ID to mark as failed." }),
    reason: Type.Optional(Type.String({ description: "Reason for failure." })),
  },
  { additionalProperties: false },
);

const SopListDefsSchema = Type.Object({}, { additionalProperties: false });

const SopGetDefSchema = Type.Object(
  {
    sop_id: Type.String({ description: "SOP definition ID to retrieve." }),
  },
  { additionalProperties: false },
);

const SopSaveDefSchema = Type.Object(
  {
    definition: Type.String({ description: "JSON string of the full SOP definition to save." }),
  },
  { additionalProperties: false },
);

const SopCurrentStepSchema = Type.Object(
  {
    task_id: Type.String({ description: "Task ID to get current step details for." }),
  },
  { additionalProperties: false },
);

export function registerSopTools(api: OpenClawPluginApi, db: DatabaseSync, dataDir: string): void {
  const engine = new SopEngine(db, dataDir);

  api.registerTool(() => createSopStartTool(engine), { name: "sop_start" });
  api.registerTool(() => createSopStatusTool(engine), { name: "sop_status" });
  api.registerTool(() => createSopNextTool(engine), { name: "sop_next" });
  api.registerTool(() => createSopCompleteStepTool(engine), { name: "sop_complete_step" });
  api.registerTool(() => createSopFailTool(engine), { name: "sop_fail" });
  api.registerTool(() => createSopListDefsTool(engine), { name: "sop_list" });
  api.registerTool(() => createSopGetDefTool(engine), { name: "sop_get_definition" });
  api.registerTool(() => createSopSaveDefTool(engine), { name: "sop_save_definition" });
  api.registerTool(() => createSopCurrentStepTool(engine), { name: "sop_current_step" });
}

function createSopStartTool(engine: SopEngine): AnyAgentTool {
  return {
    name: "sop_start",
    label: "SOP Start",
    description:
      "Start a new SOP workflow task. Returns the task ID and first step details. Use sop_list to see available SOP definitions first.",
    parameters: SopStartSchema,
    execute: async (_id, raw) => {
      const p = raw as Static<typeof SopStartSchema>;
      try {
        let ctx: Record<string, unknown> = {};
        if (p.context) {
          try {
            ctx = JSON.parse(p.context);
          } catch {
            /* ignore parse errors */
          }
        }
        const task = engine.startTask(p.sop_id, "agent", p.project_id, ctx);
        const stepInfo = engine.getCurrentStepInfo(task.id);
        return jsonToolResult({ task, currentStep: stepInfo });
      } catch (err) {
        return jsonToolResult({ error: err instanceof Error ? err.message : String(err) });
      }
    },
  };
}

function createSopStatusTool(engine: SopEngine): AnyAgentTool {
  return {
    name: "sop_status",
    label: "SOP Status",
    description:
      "Check the status of SOP tasks. Provide task_id for a specific task, or agent_id to filter by agent, or omit both to list recent tasks.",
    parameters: SopStatusSchema,
    execute: async (_id, raw) => {
      const p = raw as Static<typeof SopStatusSchema>;
      if (p.task_id) {
        const task = engine.getTask(p.task_id);
        if (!task) return jsonToolResult({ error: `Task "${p.task_id}" not found.` });
        const stepLogs = engine.getTaskStepLogs(p.task_id);
        const currentStep = engine.getCurrentStepInfo(p.task_id);
        const def = engine.getDefinition(task.sop_id);
        return jsonToolResult({ task, currentStep, stepLogs, definition: def });
      }
      const tasks = engine.listTasks(p.agent_id);
      return jsonToolResult({ tasks });
    },
  };
}

function createSopNextTool(engine: SopEngine): AnyAgentTool {
  return {
    name: "sop_next",
    label: "SOP Next Step",
    description:
      "Complete the current step and advance to the next step in the SOP workflow. Returns the next step details and any required skills.",
    parameters: SopNextSchema,
    execute: async (_id, raw) => {
      const p = raw as Static<typeof SopNextSchema>;
      try {
        let output: Record<string, unknown> = {};
        if (p.output) {
          try {
            output = JSON.parse(p.output);
          } catch {
            /* ignore parse errors */
          }
        }
        const result = engine.completeStep(p.task_id, output);
        const nextStepInfo = result.nextStep ? engine.getCurrentStepInfo(p.task_id) : null;
        return jsonToolResult({
          task: result.task,
          nextStep: nextStepInfo,
          completed: result.nextStep === null,
          message:
            result.nextStep === null
              ? "All SOP steps completed!"
              : `Advanced to step: ${nextStepInfo?.name}`,
        });
      } catch (err) {
        return jsonToolResult({ error: err instanceof Error ? err.message : String(err) });
      }
    },
  };
}

function createSopCompleteStepTool(engine: SopEngine): AnyAgentTool {
  return {
    name: "sop_complete_step",
    label: "SOP Complete Step",
    description:
      "Mark the current step as completed and advance to the next step (alias for sop_next).",
    parameters: SopCompleteStepSchema,
    execute: async (_id, raw) => {
      const p = raw as Static<typeof SopCompleteStepSchema>;
      try {
        let output: Record<string, unknown> = {};
        if (p.output) {
          try {
            output = JSON.parse(p.output);
          } catch {
            /* ignore parse errors */
          }
        }
        const result = engine.completeStep(p.task_id, output);
        const nextStepInfo = result.nextStep ? engine.getCurrentStepInfo(p.task_id) : null;
        return jsonToolResult({
          task: result.task,
          nextStep: nextStepInfo,
          completed: result.nextStep === null,
        });
      } catch (err) {
        return jsonToolResult({ error: err instanceof Error ? err.message : String(err) });
      }
    },
  };
}

function createSopFailTool(engine: SopEngine): AnyAgentTool {
  return {
    name: "sop_fail",
    label: "SOP Fail Task",
    description: "Mark a task as failed with an optional reason.",
    parameters: SopFailSchema,
    execute: async (_id, raw) => {
      const p = raw as Static<typeof SopFailSchema>;
      try {
        const task = engine.failTask(p.task_id, p.reason);
        return jsonToolResult({ task, message: `Task marked as failed.` });
      } catch (err) {
        return jsonToolResult({ error: err instanceof Error ? err.message : String(err) });
      }
    },
  };
}

function createSopListDefsTool(engine: SopEngine): AnyAgentTool {
  return {
    name: "sop_list",
    label: "SOP List Definitions",
    description: "List all available SOP workflow definitions.",
    parameters: SopListDefsSchema,
    execute: async () => {
      const defs = engine.listDefinitions();
      return jsonToolResult({
        definitions: defs.map((d) => ({
          id: d.id,
          name: d.name,
          description: d.description,
          stepCount: d.steps.length,
          steps: d.steps.map((s) => ({ id: s.id, name: s.name })),
        })),
      });
    },
  };
}

function createSopGetDefTool(engine: SopEngine): AnyAgentTool {
  return {
    name: "sop_get_definition",
    label: "SOP Get Definition",
    description:
      "Get the full details of an SOP definition including all steps, skills, and instructions.",
    parameters: SopGetDefSchema,
    execute: async (_id, raw) => {
      const p = raw as Static<typeof SopGetDefSchema>;
      const def = engine.getDefinition(p.sop_id);
      if (!def) return jsonToolResult({ error: `SOP "${p.sop_id}" not found.` });
      return jsonToolResult(def);
    },
  };
}

function createSopSaveDefTool(engine: SopEngine): AnyAgentTool {
  return {
    name: "sop_save_definition",
    label: "SOP Save Definition",
    description:
      "Create or update an SOP definition. Provide the full definition as a JSON string.",
    parameters: SopSaveDefSchema,
    execute: async (_id, raw) => {
      const p = raw as Static<typeof SopSaveDefSchema>;
      try {
        const parsed = JSON.parse(p.definition);
        const { validateSopDefinition } = await import("./schema.js");
        const def = validateSopDefinition(parsed);
        engine.saveDefinition(def);
        return jsonToolResult({
          success: true,
          message: `SOP "${def.id}" saved.`,
          definition: def,
        });
      } catch (err) {
        return jsonToolResult({ error: err instanceof Error ? err.message : String(err) });
      }
    },
  };
}

function createSopCurrentStepTool(engine: SopEngine): AnyAgentTool {
  return {
    name: "sop_current_step",
    label: "SOP Current Step",
    description:
      "Get details about the current step of a task, including required skills, tools, and instructions.",
    parameters: SopCurrentStepSchema,
    execute: async (_id, raw) => {
      const p = raw as Static<typeof SopCurrentStepSchema>;
      const info = engine.getCurrentStepInfo(p.task_id);
      if (!info) return jsonToolResult({ error: `No current step found for task "${p.task_id}".` });
      return jsonToolResult({
        ...info,
        message: `Current step: ${info.name}. Skills needed: ${info.skills.length > 0 ? info.skills.join(", ") : "none"}. Follow the instructions to complete this step.`,
      });
    },
  };
}
