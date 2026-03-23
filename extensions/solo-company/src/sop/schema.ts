import type { SopDefinition, SopStepDefinition } from "../types.js";

/**
 * Parse a YAML-like SOP definition from a JSON object.
 * SOP definitions are stored as JSON in the solo-company data directory.
 */
export function validateSopDefinition(raw: unknown): SopDefinition {
  const obj = raw as Record<string, unknown>;
  if (!obj.id || typeof obj.id !== "string")
    throw new Error("SOP definition requires an 'id' string.");
  if (!obj.name || typeof obj.name !== "string")
    throw new Error("SOP definition requires a 'name' string.");
  if (!Array.isArray(obj.steps) || obj.steps.length === 0)
    throw new Error("SOP definition requires at least one step.");

  const steps: SopStepDefinition[] = (obj.steps as unknown[]).map((s, i) => {
    const step = s as Record<string, unknown>;
    if (!step.id || typeof step.id !== "string")
      throw new Error(`Step ${i} requires an 'id' string.`);
    if (!step.name || typeof step.name !== "string")
      throw new Error(`Step ${i} requires a 'name' string.`);
    return {
      id: step.id as string,
      name: step.name as string,
      skills: Array.isArray(step.skills) ? (step.skills as string[]) : [],
      tools: Array.isArray(step.tools) ? (step.tools as string[]) : [],
      instructions: (step.instructions as string) ?? "",
      requires: Array.isArray(step.requires) ? (step.requires as string[]) : undefined,
    };
  });

  return {
    id: obj.id as string,
    name: obj.name as string,
    description: (obj.description as string) ?? undefined,
    steps,
  };
}
