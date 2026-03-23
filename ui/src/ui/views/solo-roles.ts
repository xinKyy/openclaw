import { html, nothing } from "lit";

export type SoloRolesProps = {
  connected: boolean;
  loading: boolean;
  roles: SoloRole[];
  error: string | null;
  editingRole: SoloRole | null;
  applyingConfig: boolean;
  onRefresh: () => void;
  onAdd: () => void;
  onEdit: (role: SoloRole) => void;
  onSave: (role: SoloRole) => void;
  onDelete: (id: string) => void;
  onCancel: () => void;
  onFieldChange: (field: string, value: string | string[]) => void;
  onApplyConfig: () => void;
};

export type SoloRole = {
  id: string;
  name: string;
  agentId: string;
  model: string;
  sopId?: string;
  description: string;
  skills?: string[];
  telegramBotToken?: string;
  workspace?: string;
};

export function renderSoloRoles(props: SoloRolesProps) {
  return html`
    <section class="card">
      <div class="row" style="justify-content: space-between;">
        <div>
          <div class="card-title">角色管理 (Role Management)</div>
          <div class="card-sub">管理一人公司系统中的 AI 角色，每个角色对应一个独立 Agent。</div>
        </div>
        <div class="row" style="gap: 8px;">
          <button class="btn" ?disabled=${props.loading || !props.connected} @click=${props.onRefresh}>
            ${props.loading ? "Loading…" : "Refresh"}
          </button>
          <button class="btn" ?disabled=${props.applyingConfig || !props.connected || props.roles.length === 0}
            @click=${props.onApplyConfig}
            title="将角色配置同步到 OpenClaw 网关（agents、bindings、Telegram accounts）">
            ${props.applyingConfig ? "Applying…" : "⚙ Apply to Gateway"}
          </button>
          <button class="btn primary" ?disabled=${!props.connected} @click=${props.onAdd}>
            + Add Role
          </button>
        </div>
      </div>

      ${props.error ? html`<div class="callout danger" style="margin-top: 12px;">${props.error}</div>` : nothing}

      ${props.editingRole ? renderRoleForm(props) : nothing}

      <div class="list" style="margin-top: 16px;">
        ${
          props.roles.length === 0
            ? html`
                <div class="muted" style="padding: 16px">No roles configured yet.</div>
              `
            : props.roles.map((role) => renderRoleItem(role, props))
        }
      </div>
    </section>
  `;
}

function renderRoleForm(props: SoloRolesProps) {
  const role = props.editingRole!;
  return html`
    <div class="callout" style="margin-top: 16px; padding: 16px; border: 1px solid var(--border-color);">
      <div style="font-weight: 600; margin-bottom: 12px;">${role.id ? "Edit Role" : "New Role"}</div>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
        <label class="field">
          <span>ID</span>
          <input .value=${role.id} ?disabled=${!!role.id && props.roles.some((r) => r.id === role.id)}
            @input=${(e: Event) => props.onFieldChange("id", (e.target as HTMLInputElement).value)} />
        </label>
        <label class="field">
          <span>Name</span>
          <input .value=${role.name}
            @input=${(e: Event) => props.onFieldChange("name", (e.target as HTMLInputElement).value)} />
        </label>
        <label class="field">
          <span>Model</span>
          <input .value=${role.model} placeholder="sonnet-4.6"
            @input=${(e: Event) => props.onFieldChange("model", (e.target as HTMLInputElement).value)} />
        </label>
        <label class="field">
          <span>SOP ID</span>
          <input .value=${role.sopId ?? ""} placeholder="dev-default"
            @input=${(e: Event) => props.onFieldChange("sopId", (e.target as HTMLInputElement).value)} />
        </label>
        <label class="field" style="grid-column: span 2;">
          <span>Description</span>
          <input .value=${role.description}
            @input=${(e: Event) => props.onFieldChange("description", (e.target as HTMLInputElement).value)} />
        </label>
        <label class="field" style="grid-column: span 2;">
          <span>Skills (comma-separated)</span>
          <input .value=${(role.skills ?? []).join(", ")}
            @input=${(e: Event) => props.onFieldChange("skills", (e.target as HTMLInputElement).value)} />
        </label>
        <div style="grid-column: span 2; border-top: 1px solid var(--border-color); margin: 4px 0; padding-top: 8px;">
          <span style="font-size: 12px; color: var(--text-muted);">Channel Configuration</span>
        </div>
        <label class="field" style="grid-column: span 2;">
          <span>Telegram Bot Token</span>
          <input type="password" .value=${role.telegramBotToken ?? ""} placeholder="123456:ABC-DEF..."
            autocomplete="off"
            @input=${(e: Event) => props.onFieldChange("telegramBotToken", (e.target as HTMLInputElement).value)} />
        </label>
        <label class="field" style="grid-column: span 2;">
          <span>Workspace Path</span>
          <input .value=${role.workspace ?? ""} placeholder="~/.openclaw/workspace-${role.id || "agent"}"
            @input=${(e: Event) => props.onFieldChange("workspace", (e.target as HTMLInputElement).value)} />
        </label>
      </div>
      <div class="row" style="gap: 8px; margin-top: 12px; justify-content: flex-end;">
        <button class="btn" @click=${props.onCancel}>Cancel</button>
        <button class="btn primary" @click=${() => props.onSave(role)}>Save</button>
      </div>
    </div>
  `;
}

function renderRoleItem(role: SoloRole, props: SoloRolesProps) {
  return html`
    <div class="list-item">
      <div class="list-main">
        <div class="list-title">${role.name} <span class="muted">(${role.id})</span></div>
        <div class="list-sub">${role.description}</div>
        <div style="display: flex; gap: 8px; flex-wrap: wrap; margin-top: 6px;">
          <span class="chip">Model: ${role.model}</span>
          ${role.sopId ? html`<span class="chip">SOP: ${role.sopId}</span>` : nothing}
          ${
            role.telegramBotToken
              ? html`
                  <span class="chip" style="background: #0088cc20; color: #0088cc">Telegram</span>
                `
              : nothing
          }
          ${(role.skills ?? []).map((s) => html`<span class="chip muted">${s}</span>`)}
        </div>
      </div>
      <div class="list-meta">
        <div class="row" style="gap: 8px;">
          <button class="btn" @click=${() => props.onEdit(role)}>Edit</button>
          <button class="btn danger" @click=${() => props.onDelete(role.id)}>Delete</button>
        </div>
      </div>
    </div>
  `;
}
