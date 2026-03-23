import type { AppViewState } from "../app-view-state.ts";

type State = AppViewState;

export async function loadSoloRoles(state: State): Promise<void> {
  if (!state.client) {
    return;
  }
  state.soloRolesLoading = true;
  state.soloRolesError = null;
  try {
    const result = await state.client.request<{ roles: unknown[] }>("soloCompany.roles.list");
    state.soloRoles = (result.roles ?? []) as never[];
  } catch (err) {
    state.soloRolesError = `Failed to load roles: ${String(err)}`;
  } finally {
    state.soloRolesLoading = false;
  }
}

export async function saveSoloRole(state: State, role: Record<string, unknown>): Promise<void> {
  if (!state.client) {
    return;
  }
  try {
    const existing = state.soloRoles;
    const idx = existing.findIndex((r) => r.id === role.id);
    const updated = [...existing];
    if (idx >= 0) {
      updated[idx] = { ...role, agentId: role.id };
    } else {
      updated.push({ ...role, agentId: role.id });
    }
    await state.client.request("soloCompany.roles.save", { roles: updated });
    state.soloRoles = updated as never[];
    state.soloRolesEditing = null;
  } catch (err) {
    state.soloRolesError = `Failed to save role: ${String(err)}`;
  }
}

export async function deleteSoloRole(state: State, id: string): Promise<void> {
  if (!state.client) {
    return;
  }
  try {
    const updated = state.soloRoles.filter((r) => r.id !== id);
    await state.client.request("soloCompany.roles.save", { roles: updated });
    state.soloRoles = updated as never[];
  } catch (err) {
    state.soloRolesError = `Failed to delete role: ${String(err)}`;
  }
}

export async function loadSoloProjects(state: State): Promise<void> {
  if (!state.client) {
    return;
  }
  state.soloProjectsLoading = true;
  state.soloProjectsError = null;
  try {
    const result = await state.client.request<{ projects: Record<string, unknown> }>(
      "soloCompany.projects.list",
    );
    state.soloProjects = (result.projects ?? {}) as never;
  } catch (err) {
    state.soloProjectsError = `Failed to load projects: ${String(err)}`;
  } finally {
    state.soloProjectsLoading = false;
  }
}

export async function saveSoloProject(
  state: State,
  id: string,
  project: Record<string, unknown>,
): Promise<void> {
  if (!state.client) {
    return;
  }
  try {
    await state.client.request("soloCompany.projects.save", { id, ...project });
    state.soloProjectsEditing = null;
    await loadSoloProjects(state);
  } catch (err) {
    state.soloProjectsError = `Failed to save project: ${String(err)}`;
  }
}

export async function deleteSoloProject(state: State, id: string): Promise<void> {
  if (!state.client) {
    return;
  }
  try {
    await state.client.request("soloCompany.projects.remove", { id });
    await loadSoloProjects(state);
  } catch (err) {
    state.soloProjectsError = `Failed to delete project: ${String(err)}`;
  }
}

export async function loadSoloMessages(state: State): Promise<void> {
  if (!state.client) {
    return;
  }
  state.soloMessagesLoading = true;
  state.soloMessagesError = null;
  try {
    const filters = state.soloMessagesFilters as Record<string, unknown>;
    const params: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(filters)) {
      if (val !== "" && val !== 0 && val != null) {
        params[key] = val;
      }
    }
    const result = await state.client.request<{ messages: unknown[]; total: number }>(
      "soloCompany.messages.query",
      params,
    );
    state.soloMessages = (result.messages ?? []) as never[];
    state.soloMessagesTotal = result.total ?? 0;
  } catch (err) {
    state.soloMessagesError = `Failed to load messages: ${String(err)}`;
  } finally {
    state.soloMessagesLoading = false;
  }
}

export async function loadSoloSop(state: State): Promise<void> {
  if (!state.client) {
    return;
  }
  state.soloSopLoading = true;
  state.soloSopError = null;
  try {
    const [defs, tasks] = await Promise.all([
      state.client.request<{ definitions: unknown[] }>("soloCompany.sop.listDefinitions"),
      state.client.request<{ tasks: unknown[] }>("soloCompany.sop.listTasks", {}),
    ]);
    state.soloSopDefinitions = (defs.definitions ?? []) as never[];
    state.soloSopTasks = (tasks.tasks ?? []) as never[];
  } catch (err) {
    state.soloSopError = `Failed to load SOP data: ${String(err)}`;
  } finally {
    state.soloSopLoading = false;
  }
}

export async function loadSoloSopTask(state: State, taskId: string): Promise<void> {
  if (!state.client) {
    return;
  }
  try {
    const result = await state.client.request<Record<string, unknown>>("soloCompany.sop.getTask", {
      id: taskId,
    });
    state.soloSopSelectedTask = result as never;
  } catch (err) {
    state.soloSopError = `Failed to load task: ${String(err)}`;
  }
}
