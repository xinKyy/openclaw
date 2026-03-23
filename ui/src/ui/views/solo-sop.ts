import { html, nothing } from "lit";

export type SoloSopProps = {
  connected: boolean;
  loading: boolean;
  definitions: SopDefSummary[];
  tasks: SopTaskSummary[];
  error: string | null;
  selectedTask: SopTaskDetail | null;
  onRefresh: () => void;
  onSelectTask: (taskId: string) => void;
  onDeselectTask: () => void;
};

export type SopDefSummary = {
  id: string;
  name: string;
  description?: string;
  stepCount: number;
  steps: Array<{ id: string; name: string }>;
};

export type SopTaskSummary = {
  id: string;
  sop_id: string;
  agent_id: string;
  project_id: string | null;
  status: string;
  current_step: string | null;
  created_at: string;
  updated_at: string;
};

export type SopStepLogEntry = {
  id: string;
  step_id: string;
  status: string;
  started_at: string;
  completed_at: string | null;
};

export type SopTaskDetail = {
  task: SopTaskSummary;
  stepLogs: SopStepLogEntry[];
  currentStep: {
    stepId: string;
    name: string;
    skills: string[];
    tools: string[];
    instructions: string;
  } | null;
};

export function renderSoloSop(props: SoloSopProps) {
  return html`
    <section class="card">
      <div class="row" style="justify-content: space-between;">
        <div>
          <div class="card-title">SOP 管理 (SOP Management)</div>
          <div class="card-sub">管理标准操作流程定义和追踪任务执行状态。</div>
        </div>
        <button class="btn" ?disabled=${props.loading || !props.connected} @click=${props.onRefresh}>
          ${props.loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      ${props.error ? html`<div class="callout danger" style="margin-top: 12px;">${props.error}</div>` : nothing}

      <!-- SOP Definitions -->
      <div style="margin-top: 20px;">
        <div style="font-weight: 600; font-size: 1.05em; margin-bottom: 8px;">SOP Definitions</div>
        <div class="list">
          ${
            props.definitions.length === 0
              ? html`
                  <div class="muted" style="padding: 12px">No SOP definitions found.</div>
                `
              : props.definitions.map((def) => renderDefItem(def))
          }
        </div>
      </div>

      <!-- Tasks Dashboard -->
      <div style="margin-top: 20px;">
        <div style="font-weight: 600; font-size: 1.05em; margin-bottom: 8px;">Task Dashboard</div>

        ${props.selectedTask ? renderTaskDetail(props.selectedTask, props) : nothing}

        <div class="list">
          ${
            props.tasks.length === 0
              ? html`
                  <div class="muted" style="padding: 12px">No tasks yet.</div>
                `
              : props.tasks.map((task) => renderTaskItem(task, props))
          }
        </div>
      </div>
    </section>
  `;
}

function renderDefItem(def: SopDefSummary) {
  return html`
    <div class="list-item">
      <div class="list-main">
        <div class="list-title">${def.name} <span class="muted">(${def.id})</span></div>
        <div class="list-sub">${def.description ?? ""}</div>
        <div style="display: flex; gap: 6px; flex-wrap: wrap; margin-top: 6px;">
          ${def.steps.map(
            (s, i) => html`
            <span class="chip muted">${i + 1}. ${s.name}</span>
          `,
          )}
        </div>
      </div>
      <div class="list-meta">
        <span class="chip">${def.stepCount} steps</span>
      </div>
    </div>
  `;
}

function renderTaskItem(task: SopTaskSummary, props: SoloSopProps) {
  const statusColor =
    task.status === "completed"
      ? "var(--success-color, #0a7f5a)"
      : task.status === "failed"
        ? "var(--danger-color, #d14343)"
        : task.status === "in_progress"
          ? "var(--info-color, #3b82f6)"
          : "inherit";

  return html`
    <div class="list-item" style="cursor: pointer;" @click=${() => props.onSelectTask(task.id)}>
      <div class="list-main">
        <div class="list-title">
          ${task.id}
          <span class="chip" style="color: ${statusColor}; border-color: ${statusColor};">${task.status}</span>
        </div>
        <div class="list-sub">
          SOP: ${task.sop_id} | Agent: ${task.agent_id}
          ${task.project_id ? ` | Project: ${task.project_id}` : ""}
        </div>
        <div class="muted" style="font-size: 0.85em; margin-top: 4px;">
          Step: ${task.current_step ?? "—"} | Updated: ${new Date(task.updated_at).toLocaleString()}
        </div>
      </div>
    </div>
  `;
}

function renderTaskDetail(detail: SopTaskDetail, props: SoloSopProps) {
  const { task, stepLogs, currentStep } = detail;
  return html`
    <div class="callout" style="margin-bottom: 16px; padding: 16px; border: 1px solid var(--border-color);">
      <div class="row" style="justify-content: space-between;">
        <div style="font-weight: 600;">Task: ${task.id}</div>
        <button class="btn" @click=${props.onDeselectTask}>Close</button>
      </div>

      ${
        currentStep
          ? html`
        <div style="margin-top: 12px; padding: 12px; background: var(--surface-alt, #f5f5f5); border-radius: 6px;">
          <div style="font-weight: 500;">Current Step: ${currentStep.name}</div>
          <div class="muted" style="margin-top: 4px;">${currentStep.instructions}</div>
          ${
            currentStep.skills.length > 0
              ? html`
            <div style="margin-top: 6px;">Skills: ${currentStep.skills.map((s) => html`<span class="chip">${s}</span> `)}</div>
          `
              : nothing
          }
        </div>
      `
          : nothing
      }

      <div style="margin-top: 12px;">
        <div style="font-weight: 500; margin-bottom: 6px;">Step Logs</div>
        ${stepLogs.map(
          (log) => html`
          <div style="display: flex; gap: 8px; align-items: center; padding: 4px 0; border-bottom: 1px solid var(--border-color);">
            <span class="chip" style="min-width: 80px;">${log.status}</span>
            <span>${log.step_id}</span>
            <span class="muted" style="margin-left: auto; font-size: 0.85em;">
              ${new Date(log.started_at).toLocaleString()}
              ${log.completed_at ? ` → ${new Date(log.completed_at).toLocaleString()}` : ""}
            </span>
          </div>
        `,
        )}
      </div>
    </div>
  `;
}
