import { html, nothing } from "lit";

export type SoloMessagesProps = {
  connected: boolean;
  loading: boolean;
  messages: SoloMessage[];
  total: number;
  error: string | null;
  filters: SoloMessageFilters;
  onRefresh: () => void;
  onFilterChange: (field: string, value: string) => void;
  onSearch: () => void;
  onPageChange: (offset: number) => void;
};

export type SoloMessage = {
  msg_id: string;
  channel: string;
  group_id: string | null;
  group_name: string | null;
  sender: string | null;
  sender_name: string | null;
  content: string | null;
  chat_type: string | null;
  thread_id: string | null;
  created_at: string;
};

export type SoloMessageFilters = {
  group_id: string;
  channel: string;
  sender: string;
  keyword: string;
  date: string;
  date_from: string;
  date_to: string;
  limit: number;
  offset: number;
};

export function renderSoloMessages(props: SoloMessagesProps) {
  const pageSize = props.filters.limit || 50;
  const currentPage = Math.floor(props.filters.offset / pageSize);
  const totalPages = Math.ceil(props.total / pageSize);

  return html`
    <section class="card">
      <div class="row" style="justify-content: space-between;">
        <div>
          <div class="card-title">消息浏览器 (Message Browser)</div>
          <div class="card-sub">浏览和搜索所有渠道记录的消息。Total: ${props.total} messages</div>
        </div>
        <button class="btn" ?disabled=${props.loading || !props.connected} @click=${props.onRefresh}>
          ${props.loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      ${props.error ? html`<div class="callout danger" style="margin-top: 12px;">${props.error}</div>` : nothing}

      <div class="filters" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 8px; margin-top: 14px;">
        <label class="field">
          <span>Channel</span>
          <input .value=${props.filters.channel} placeholder="telegram, discord..."
            @input=${(e: Event) => props.onFilterChange("channel", (e.target as HTMLInputElement).value)} />
        </label>
        <label class="field">
          <span>Group ID</span>
          <input .value=${props.filters.group_id} placeholder="Group/conversation ID"
            @input=${(e: Event) => props.onFilterChange("group_id", (e.target as HTMLInputElement).value)} />
        </label>
        <label class="field">
          <span>Sender</span>
          <input .value=${props.filters.sender} placeholder="Sender ID"
            @input=${(e: Event) => props.onFilterChange("sender", (e.target as HTMLInputElement).value)} />
        </label>
        <label class="field">
          <span>Keyword</span>
          <input .value=${props.filters.keyword} placeholder="Search text..."
            @input=${(e: Event) => props.onFilterChange("keyword", (e.target as HTMLInputElement).value)} />
        </label>
        <label class="field">
          <span>Date</span>
          <input type="date" .value=${props.filters.date}
            @input=${(e: Event) => props.onFilterChange("date", (e.target as HTMLInputElement).value)} />
        </label>
        <label class="field">
          <span>From</span>
          <input type="date" .value=${props.filters.date_from}
            @input=${(e: Event) => props.onFilterChange("date_from", (e.target as HTMLInputElement).value)} />
        </label>
        <label class="field">
          <span>To</span>
          <input type="date" .value=${props.filters.date_to}
            @input=${(e: Event) => props.onFilterChange("date_to", (e.target as HTMLInputElement).value)} />
        </label>
        <div style="display: flex; align-items: flex-end;">
          <button class="btn primary" @click=${props.onSearch} ?disabled=${props.loading}>Search</button>
        </div>
      </div>

      <div class="list" style="margin-top: 16px;">
        ${
          props.messages.length === 0
            ? html`
                <div class="muted" style="padding: 16px">No messages found.</div>
              `
            : props.messages.map((msg) => renderMessageItem(msg))
        }
      </div>

      ${
        totalPages > 1
          ? html`
        <div class="row" style="justify-content: center; gap: 8px; margin-top: 12px;">
          <button class="btn" ?disabled=${currentPage === 0}
            @click=${() => props.onPageChange(Math.max(0, props.filters.offset - pageSize))}>← Prev</button>
          <span class="muted">Page ${currentPage + 1} of ${totalPages}</span>
          <button class="btn" ?disabled=${currentPage >= totalPages - 1}
            @click=${() => props.onPageChange(props.filters.offset + pageSize)}>Next →</button>
        </div>
      `
          : nothing
      }
    </section>
  `;
}

function renderMessageItem(msg: SoloMessage) {
  const time = msg.created_at ? new Date(msg.created_at).toLocaleString() : "";
  return html`
    <div class="list-item" style="padding: 8px 12px;">
      <div class="list-main" style="min-width: 0;">
        <div class="row" style="gap: 8px; flex-wrap: wrap;">
          <span class="chip">${msg.channel}</span>
          ${msg.group_name ? html`<span class="chip muted">${msg.group_name}</span>` : nothing}
          <span style="font-weight: 500;">${msg.sender_name ?? msg.sender ?? "unknown"}</span>
          <span class="muted" style="font-size: 0.85em;">${time}</span>
        </div>
        <div style="margin-top: 4px; white-space: pre-wrap; word-break: break-word; max-height: 120px; overflow: hidden;">
          ${msg.content ?? ""}
        </div>
      </div>
    </div>
  `;
}
