import type { DatabaseSync } from "node:sqlite";
import { Type, type Static } from "@sinclair/typebox";
import type { OpenClawPluginApi, AnyAgentTool } from "../../api.js";
import { jsonToolResult } from "../tool-result.js";

function stringEnum<T extends readonly string[]>(values: T, description: string) {
  return Type.Unsafe<T[number]>({
    type: "string",
    enum: [...values],
    description,
  });
}

/**
 * Register the message_received hook that persists every inbound message
 * to SQLite with msg_id-based deduplication.
 */
export function registerMessageHook(api: OpenClawPluginApi, db: DatabaseSync): void {
  const insertStmt = db.prepare(`
    INSERT OR IGNORE INTO channel_messages
      (msg_id, channel, group_id, group_name, sender, sender_name, content, raw_context, chat_type, thread_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime(?, 'unixepoch'))
  `);

  api.on("message_received", (event, ctx) => {
    const meta = (event.metadata ?? {}) as Record<string, unknown>;
    const msgId = deriveMsgId(meta, ctx, event);
    if (!msgId) return;

    const isGroup = ctx.conversationId !== event.from;
    const ts = event.timestamp ?? Math.floor(Date.now() / 1000);

    try {
      insertStmt.run(
        msgId,
        ctx.channelId ?? "",
        isGroup ? (ctx.conversationId ?? null) : null,
        (meta.channelName as string) ?? null,
        (meta.senderId as string) ?? event.from ?? null,
        (meta.senderName as string) ?? null,
        event.content ?? null,
        JSON.stringify(meta),
        isGroup ? "group" : "direct",
        meta.threadId != null ? String(meta.threadId) : null,
        ts,
      );
    } catch {
      // UNIQUE constraint violation = duplicate, silently ignore
    }
  });
}

function deriveMsgId(
  meta: Record<string, unknown>,
  ctx: { channelId: string; conversationId?: string },
  event: { from: string; content: string; timestamp?: number },
): string | null {
  if (meta.messageId) return String(meta.messageId);
  // Fallback: compose a synthetic id from channel + conversation + sender + timestamp
  const ts = event.timestamp ?? Math.floor(Date.now() / 1000);
  return `${ctx.channelId}:${ctx.conversationId ?? ""}:${event.from}:${ts}`;
}

// ---------------------------------------------------------------------------
// Agent Tools
// ---------------------------------------------------------------------------

const MessageQuerySchema = Type.Object(
  {
    group_id: Type.Optional(Type.String({ description: "Filter by group/conversation ID." })),
    channel: Type.Optional(
      Type.String({ description: "Filter by channel (telegram, discord, slack, etc.)." }),
    ),
    sender: Type.Optional(Type.String({ description: "Filter by sender ID." })),
    keyword: Type.Optional(
      Type.String({ description: "Full-text keyword search in message content." }),
    ),
    date: Type.Optional(
      Type.String({ description: "Filter messages on a specific date (YYYY-MM-DD)." }),
    ),
    date_from: Type.Optional(
      Type.String({ description: "Start date for range query (YYYY-MM-DD)." }),
    ),
    date_to: Type.Optional(Type.String({ description: "End date for range query (YYYY-MM-DD)." })),
    limit: Type.Optional(
      Type.Number({
        description: "Max results to return. Default 50, max 500.",
        minimum: 1,
        maximum: 500,
      }),
    ),
    offset: Type.Optional(
      Type.Number({ description: "Number of results to skip for pagination.", minimum: 0 }),
    ),
  },
  { additionalProperties: false },
);

const MessageStatsSchema = Type.Object(
  {
    group_id: Type.Optional(Type.String({ description: "Filter by group/conversation ID." })),
    channel: Type.Optional(Type.String({ description: "Filter by channel." })),
    date: Type.Optional(
      Type.String({ description: "Date for stats (YYYY-MM-DD). Defaults to today." }),
    ),
    date_from: Type.Optional(
      Type.String({ description: "Start date for range stats (YYYY-MM-DD)." }),
    ),
    date_to: Type.Optional(Type.String({ description: "End date for range stats (YYYY-MM-DD)." })),
  },
  { additionalProperties: false },
);

export function registerMessageTools(api: OpenClawPluginApi, db: DatabaseSync): void {
  api.registerTool(() => createMessageQueryTool(db), { name: "message_query" });
  api.registerTool(() => createMessageStatsTool(db), { name: "message_stats" });
}

function createMessageQueryTool(db: DatabaseSync): AnyAgentTool {
  return {
    name: "message_query",
    label: "Message Query",
    description:
      "Query recorded channel messages with flexible filters: group, channel, sender, keyword, date, date range. Returns messages sorted by time descending.",
    parameters: MessageQuerySchema,
    execute: async (_id, raw) => {
      const p = raw as Static<typeof MessageQuerySchema>;
      const conditions: string[] = [];
      const params: unknown[] = [];

      if (p.group_id) {
        conditions.push("group_id = ?");
        params.push(p.group_id);
      }
      if (p.channel) {
        conditions.push("channel = ?");
        params.push(p.channel);
      }
      if (p.sender) {
        conditions.push("sender = ?");
        params.push(p.sender);
      }
      if (p.keyword) {
        conditions.push("content LIKE ?");
        params.push(`%${p.keyword}%`);
      }
      if (p.date) {
        conditions.push("date(created_at) = ?");
        params.push(p.date);
      }
      if (p.date_from) {
        conditions.push("created_at >= datetime(?)");
        params.push(`${p.date_from} 00:00:00`);
      }
      if (p.date_to) {
        conditions.push("created_at <= datetime(?)");
        params.push(`${p.date_to} 23:59:59`);
      }

      const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
      const limit = Math.min(p.limit ?? 50, 500);
      const offset = p.offset ?? 0;

      const sql = `SELECT msg_id, channel, group_id, group_name, sender, sender_name, content, chat_type, thread_id, created_at FROM channel_messages ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`;
      params.push(limit, offset);

      const rows = db.prepare(sql).all(...(params as Array<string | number | null>));
      return jsonToolResult({ count: rows.length, messages: rows });
    },
  };
}

function createMessageStatsTool(db: DatabaseSync): AnyAgentTool {
  return {
    name: "message_stats",
    label: "Message Stats",
    description:
      "Get message count statistics grouped by channel and group, with optional date/range filters.",
    parameters: MessageStatsSchema,
    execute: async (_id, raw) => {
      const p = raw as Static<typeof MessageStatsSchema>;
      const conditions: string[] = [];
      const params: unknown[] = [];

      if (p.group_id) {
        conditions.push("group_id = ?");
        params.push(p.group_id);
      }
      if (p.channel) {
        conditions.push("channel = ?");
        params.push(p.channel);
      }
      if (p.date) {
        conditions.push("date(created_at) = ?");
        params.push(p.date);
      } else {
        if (p.date_from) {
          conditions.push("created_at >= datetime(?)");
          params.push(`${p.date_from} 00:00:00`);
        }
        if (p.date_to) {
          conditions.push("created_at <= datetime(?)");
          params.push(`${p.date_to} 23:59:59`);
        }
      }

      const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
      const sql = `SELECT channel, group_id, group_name, COUNT(*) as message_count, MIN(created_at) as earliest, MAX(created_at) as latest FROM channel_messages ${where} GROUP BY channel, group_id ORDER BY message_count DESC`;

      const sqlParams = params as Array<string | number | null>;
      const rows = db.prepare(sql).all(...sqlParams);
      const totalSql = `SELECT COUNT(*) as total FROM channel_messages ${where}`;
      const totalRow = db.prepare(totalSql).get(...sqlParams) as { total: number } | undefined;

      return jsonToolResult({
        total: totalRow?.total ?? 0,
        groups: rows,
      });
    },
  };
}
