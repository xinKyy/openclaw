import { html, nothing } from "lit";

export type SoloProjectsProps = {
  connected: boolean;
  loading: boolean;
  projects: Record<string, SoloProject>;
  error: string | null;
  editingProject: { id: string; project: SoloProject } | null;
  onRefresh: () => void;
  onAdd: () => void;
  onEdit: (id: string, project: SoloProject) => void;
  onSave: (id: string, project: SoloProject) => void;
  onDelete: (id: string) => void;
  onCancel: () => void;
  onFieldChange: (field: string, value: string) => void;
};

export type SoloProject = {
  repo: string;
  aliases: string[];
  default_branch: string;
  dev_branch: string;
  branches: Record<string, string>;
  description: string;
  jenkins_job: string;
};

export function renderSoloProjects(props: SoloProjectsProps) {
  const projectEntries = Object.entries(props.projects);

  return html`
    <section class="card">
      <div class="row" style="justify-content: space-between;">
        <div>
          <div class="card-title">项目管理 (Project Management)</div>
          <div class="card-sub">管理项目仓库配置，包括 Git 仓库、分支和 Jenkins 流水线。</div>
        </div>
        <div class="row" style="gap: 8px;">
          <button class="btn" ?disabled=${props.loading || !props.connected} @click=${props.onRefresh}>
            ${props.loading ? "Loading…" : "Refresh"}
          </button>
          <button class="btn primary" ?disabled=${!props.connected} @click=${props.onAdd}>
            + Add Project
          </button>
        </div>
      </div>

      ${props.error ? html`<div class="callout danger" style="margin-top: 12px;">${props.error}</div>` : nothing}

      ${props.editingProject ? renderProjectForm(props) : nothing}

      <div class="list" style="margin-top: 16px;">
        ${
          projectEntries.length === 0
            ? html`
                <div class="muted" style="padding: 16px">No projects registered yet.</div>
              `
            : projectEntries.map(([id, proj]) => renderProjectItem(id, proj, props))
        }
      </div>
    </section>
  `;
}

function renderProjectForm(props: SoloProjectsProps) {
  const { id, project } = props.editingProject!;
  return html`
    <div class="callout" style="margin-top: 16px; padding: 16px; border: 1px solid var(--border-color);">
      <div style="font-weight: 600; margin-bottom: 12px;">${id ? "Edit Project" : "New Project"}</div>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
        <label class="field">
          <span>Project ID</span>
          <input .value=${id}
            @input=${(e: Event) => props.onFieldChange("id", (e.target as HTMLInputElement).value)} />
        </label>
        <label class="field">
          <span>Repository URL</span>
          <input .value=${project.repo} placeholder="https://gitlabs.fortu.pro/web/project.git"
            @input=${(e: Event) => props.onFieldChange("repo", (e.target as HTMLInputElement).value)} />
        </label>
        <label class="field">
          <span>Default Branch</span>
          <input .value=${project.default_branch}
            @input=${(e: Event) => props.onFieldChange("default_branch", (e.target as HTMLInputElement).value)} />
        </label>
        <label class="field">
          <span>Dev Branch</span>
          <input .value=${project.dev_branch}
            @input=${(e: Event) => props.onFieldChange("dev_branch", (e.target as HTMLInputElement).value)} />
        </label>
        <label class="field" style="grid-column: span 2;">
          <span>Description</span>
          <input .value=${project.description}
            @input=${(e: Event) => props.onFieldChange("description", (e.target as HTMLInputElement).value)} />
        </label>
        <label class="field">
          <span>Aliases (comma-separated)</span>
          <input .value=${project.aliases.join(", ")}
            @input=${(e: Event) => props.onFieldChange("aliases", (e.target as HTMLInputElement).value)} />
        </label>
        <label class="field">
          <span>Jenkins Job</span>
          <input .value=${project.jenkins_job}
            @input=${(e: Event) => props.onFieldChange("jenkins_job", (e.target as HTMLInputElement).value)} />
        </label>
      </div>
      <div class="row" style="gap: 8px; margin-top: 12px; justify-content: flex-end;">
        <button class="btn" @click=${props.onCancel}>Cancel</button>
        <button class="btn primary" @click=${() => props.onSave(id, project)}>Save</button>
      </div>
    </div>
  `;
}

function renderProjectItem(id: string, project: SoloProject, props: SoloProjectsProps) {
  return html`
    <div class="list-item">
      <div class="list-main">
        <div class="list-title">${id}</div>
        <div class="list-sub">${project.description}</div>
        <div style="display: flex; gap: 8px; flex-wrap: wrap; margin-top: 6px;">
          <span class="chip">Branch: ${project.default_branch}</span>
          <span class="chip">Dev: ${project.dev_branch}</span>
          ${project.jenkins_job ? html`<span class="chip">Jenkins: ${project.jenkins_job}</span>` : nothing}
          ${project.aliases.map((a) => html`<span class="chip muted">${a}</span>`)}
        </div>
      </div>
      <div class="list-meta">
        <div class="row" style="gap: 8px;">
          <button class="btn" @click=${() => props.onEdit(id, project)}>Edit</button>
          <button class="btn danger" @click=${() => props.onDelete(id)}>Delete</button>
        </div>
      </div>
    </div>
  `;
}
