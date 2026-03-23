import fs from "node:fs";
import path from "node:path";
import type { DatabaseSync, StatementSync } from "node:sqlite";
import type { SopDefinition, SopTask, SopStepLog } from "../types.js";
import { validateSopDefinition } from "./schema.js";

const SOP_DIR = "sop-definitions";

export class SopEngine {
  private db: DatabaseSync;
  private dataDir: string;
  private definitions: Map<string, SopDefinition> = new Map();

  // Prepared statements
  private insertTaskStmt: StatementSync;
  private updateTaskStmt: StatementSync;
  private getTaskStmt: StatementSync;
  private listTasksStmt: StatementSync;
  private insertStepLogStmt: StatementSync;
  private updateStepLogStmt: StatementSync;
  private getStepLogsStmt: StatementSync;

  constructor(db: DatabaseSync, dataDir: string) {
    this.db = db;
    this.dataDir = dataDir;
    this.loadDefinitions();

    this.insertTaskStmt = db.prepare(`
      INSERT INTO sop_tasks (id, sop_id, agent_id, project_id, status, current_step, context, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'in_progress', ?, ?, datetime('now'), datetime('now'))
    `);
    this.updateTaskStmt = db.prepare(`
      UPDATE sop_tasks SET status = ?, current_step = ?, context = ?, updated_at = datetime('now') WHERE id = ?
    `);
    this.getTaskStmt = db.prepare(`SELECT * FROM sop_tasks WHERE id = ?`);
    this.listTasksStmt = db.prepare(`SELECT * FROM sop_tasks ORDER BY updated_at DESC LIMIT 50`);
    this.insertStepLogStmt = db.prepare(`
      INSERT INTO sop_step_logs (id, task_id, step_id, status, input, started_at)
      VALUES (?, ?, ?, 'in_progress', ?, datetime('now'))
    `);
    this.updateStepLogStmt = db.prepare(`
      UPDATE sop_step_logs SET status = ?, output = ?, completed_at = datetime('now') WHERE id = ?
    `);
    this.getStepLogsStmt = db.prepare(
      `SELECT * FROM sop_step_logs WHERE task_id = ? ORDER BY started_at ASC`,
    );
  }

  private loadDefinitions(): void {
    const sopDir = path.join(this.dataDir, SOP_DIR);
    if (!fs.existsSync(sopDir)) {
      fs.mkdirSync(sopDir, { recursive: true });
      this.seedDefaultDefinitions(sopDir);
    }

    const files = fs.readdirSync(sopDir).filter((f) => f.endsWith(".json"));
    for (const file of files) {
      try {
        const raw = JSON.parse(fs.readFileSync(path.join(sopDir, file), "utf-8"));
        const def = validateSopDefinition(raw);
        this.definitions.set(def.id, def);
      } catch {
        // Skip invalid files
      }
    }
  }

  private seedDefaultDefinitions(sopDir: string): void {
    const devDefault: SopDefinition = {
      id: "dev-default",
      name: "开发工程师标准流程",
      steps: [
        {
          id: "read-requirements",
          name: "阅读需求文档",
          skills: [],
          tools: ["message_query"],
          instructions: "使用 message_query 查询相关群组的需求讨论记录",
        },
        {
          id: "setup-branch",
          name: "拉取代码并创建分支",
          skills: ["gitlab-ops"],
          tools: ["project_get"],
          instructions: "先用 project_get 获取仓库信息，再按 gitlab-ops 技能操作",
        },
        {
          id: "develop",
          name: "编写代码",
          skills: ["coding-agent"],
          tools: ["project_get"],
          instructions: "使用 Codex 在项目目录中执行编码任务",
        },
        {
          id: "deploy-dev",
          name: "部署到dev环境",
          skills: ["jenkins-deploy"],
          tools: ["project_get"],
          instructions: "触发 Jenkins 构建并等待结果",
        },
        {
          id: "notify-test",
          name: "通知测试",
          skills: [],
          tools: [],
          instructions: "在群里通知测试人员进行测试",
        },
        {
          id: "submit-mr",
          name: "提交MR",
          skills: ["gitlab-mr"],
          tools: ["project_get"],
          instructions: "创建 GitLab MR 到开发分支",
        },
      ],
    };

    const pmDefault: SopDefinition = {
      id: "pm-default",
      name: "产品经理标准流程",
      steps: [
        {
          id: "analyze-requirements",
          name: "分析需求",
          skills: [],
          tools: ["message_query"],
          instructions: "使用 message_query 查询并整理需求相关讨论",
        },
        {
          id: "create-tasks",
          name: "创建任务",
          skills: ["project-workflow"],
          tools: ["project_list"],
          instructions: "根据需求拆解为开发任务，并分配给相应角色",
        },
        {
          id: "track-progress",
          name: "跟踪进度",
          skills: [],
          tools: ["sop_status"],
          instructions: "使用 sop_status 跟踪各任务的执行进度",
        },
        {
          id: "review-deliver",
          name: "验收交付",
          skills: [],
          tools: ["message_query"],
          instructions: "检查测试结果，确认功能交付",
        },
      ],
    };

    fs.writeFileSync(path.join(sopDir, "dev-default.json"), JSON.stringify(devDefault, null, 2));
    fs.writeFileSync(path.join(sopDir, "pm-default.json"), JSON.stringify(pmDefault, null, 2));
  }

  reloadDefinitions(): void {
    this.definitions.clear();
    this.loadDefinitions();
  }

  listDefinitions(): SopDefinition[] {
    return Array.from(this.definitions.values());
  }

  getDefinition(id: string): SopDefinition | null {
    return this.definitions.get(id) ?? null;
  }

  saveDefinition(def: SopDefinition): void {
    const sopDir = path.join(this.dataDir, SOP_DIR);
    fs.mkdirSync(sopDir, { recursive: true });
    fs.writeFileSync(path.join(sopDir, `${def.id}.json`), JSON.stringify(def, null, 2));
    this.definitions.set(def.id, def);
  }

  deleteDefinition(id: string): boolean {
    const sopDir = path.join(this.dataDir, SOP_DIR);
    const filePath = path.join(sopDir, `${id}.json`);
    if (!fs.existsSync(filePath)) return false;
    fs.unlinkSync(filePath);
    this.definitions.delete(id);
    return true;
  }

  // --- Task management ---

  startTask(
    sopId: string,
    agentId: string,
    projectId?: string,
    context?: Record<string, unknown>,
  ): SopTask {
    const def = this.definitions.get(sopId);
    if (!def) throw new Error(`SOP definition "${sopId}" not found.`);
    if (def.steps.length === 0) throw new Error(`SOP "${sopId}" has no steps.`);

    const taskId = `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const firstStep = def.steps[0].id;
    const ctx = JSON.stringify(context ?? {});

    this.insertTaskStmt.run(taskId, sopId, agentId, projectId ?? null, firstStep, ctx);

    // Log the first step as started
    const stepLogId = `log-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.insertStepLogStmt.run(stepLogId, taskId, firstStep, ctx);

    return this.getTaskStmt.get(taskId) as unknown as SopTask;
  }

  getTask(taskId: string): SopTask | null {
    return (this.getTaskStmt.get(taskId) as unknown as SopTask) ?? null;
  }

  listTasks(agentId?: string): SopTask[] {
    if (agentId) {
      return this.db
        .prepare(`SELECT * FROM sop_tasks WHERE agent_id = ? ORDER BY updated_at DESC LIMIT 50`)
        .all(agentId) as unknown as SopTask[];
    }
    return this.listTasksStmt.all() as unknown as SopTask[];
  }

  completeStep(
    taskId: string,
    output?: Record<string, unknown>,
  ): { task: SopTask; nextStep: string | null } {
    const task = this.getTaskStmt.get(taskId) as unknown as SopTask | undefined;
    if (!task) throw new Error(`Task "${taskId}" not found.`);
    if (task.status === "completed" || task.status === "failed") {
      throw new Error(`Task "${taskId}" is already ${task.status}.`);
    }

    const def = this.definitions.get(task.sop_id);
    if (!def) throw new Error(`SOP definition "${task.sop_id}" not found.`);

    // Complete current step log
    const stepLogs = this.getStepLogsStmt.all(taskId) as unknown as SopStepLog[];
    const currentLog = stepLogs.find(
      (l) => l.step_id === task.current_step && l.status === "in_progress",
    );
    if (currentLog) {
      this.updateStepLogStmt.run("completed", JSON.stringify(output ?? {}), currentLog.id);
    }

    // Find next step
    const currentIdx = def.steps.findIndex((s) => s.id === task.current_step);
    const nextIdx = currentIdx + 1;

    // SQLite stores context as a JSON string; pass it through as-is
    const ctxStr = typeof task.context === "string" ? task.context : JSON.stringify(task.context);

    if (nextIdx >= def.steps.length) {
      this.updateTaskStmt.run("completed", task.current_step, ctxStr, taskId);
      return { task: this.getTaskStmt.get(taskId) as unknown as SopTask, nextStep: null };
    }

    const nextStep = def.steps[nextIdx];
    this.updateTaskStmt.run("in_progress", nextStep.id, ctxStr, taskId);

    // Start next step log
    const stepLogId = `log-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.insertStepLogStmt.run(stepLogId, taskId, nextStep.id, "{}");

    return { task: this.getTaskStmt.get(taskId) as unknown as SopTask, nextStep: nextStep.id };
  }

  failTask(taskId: string, reason?: string): SopTask {
    const task = this.getTaskStmt.get(taskId) as unknown as SopTask | undefined;
    if (!task) throw new Error(`Task "${taskId}" not found.`);

    const ctx = { ...JSON.parse(String(task.context ?? "{}")), failReason: reason };
    this.updateTaskStmt.run("failed", task.current_step, JSON.stringify(ctx), taskId);

    // Fail current step log
    const stepLogs = this.getStepLogsStmt.all(taskId) as unknown as SopStepLog[];
    const currentLog = stepLogs.find(
      (l) => l.step_id === task.current_step && l.status === "in_progress",
    );
    if (currentLog) {
      this.updateStepLogStmt.run("failed", JSON.stringify({ reason }), currentLog.id);
    }

    return this.getTaskStmt.get(taskId) as unknown as SopTask;
  }

  getTaskStepLogs(taskId: string): SopStepLog[] {
    return this.getStepLogsStmt.all(taskId) as unknown as SopStepLog[];
  }

  /**
   * Returns the skills required for the current step of a task.
   * The SOP engine activates these skills in the agent's prompt.
   */
  getCurrentStepSkills(taskId: string): string[] {
    const task = this.getTask(taskId);
    if (!task || !task.current_step) return [];
    const def = this.definitions.get(task.sop_id);
    if (!def) return [];
    const step = def.steps.find((s) => s.id === task.current_step);
    return step?.skills ?? [];
  }

  /**
   * Returns the full step info for the current step.
   */
  getCurrentStepInfo(taskId: string): {
    stepId: string;
    name: string;
    skills: string[];
    tools: string[];
    instructions: string;
  } | null {
    const task = this.getTask(taskId);
    if (!task || !task.current_step) return null;
    const def = this.definitions.get(task.sop_id);
    if (!def) return null;
    const step = def.steps.find((s) => s.id === task.current_step);
    if (!step) return null;
    return {
      stepId: step.id,
      name: step.name,
      skills: step.skills,
      tools: step.tools,
      instructions: step.instructions,
    };
  }
}
