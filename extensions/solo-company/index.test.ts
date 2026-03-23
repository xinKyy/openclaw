import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initDatabase } from "./src/db/init.js";
import { ProjectRegistryManager } from "./src/projects/registry.js";
import { SopEngine } from "./src/sop/engine.js";
import { validateSopDefinition } from "./src/sop/schema.js";

describe("solo-company", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "solo-company-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("database initialization", () => {
    it("creates database and runs migrations", () => {
      const db = initDatabase(tmpDir);
      expect(db).toBeDefined();

      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
        .all() as Array<{ name: string }>;
      const tableNames = tables.map((t) => t.name);

      expect(tableNames).toContain("channel_messages");
      expect(tableNames).toContain("sop_tasks");
      expect(tableNames).toContain("sop_step_logs");
      expect(tableNames).toContain("schema_meta");

      const version = db.prepare("SELECT value FROM schema_meta WHERE key = 'version'").get() as {
        value: string;
      };
      expect(version.value).toBe("1");
      db.close();
    });

    it("is idempotent on re-open", () => {
      const db1 = initDatabase(tmpDir);
      db1.close();
      const db2 = initDatabase(tmpDir);
      const version = db2.prepare("SELECT value FROM schema_meta WHERE key = 'version'").get() as {
        value: string;
      };
      expect(version.value).toBe("1");
      db2.close();
    });
  });

  describe("message deduplication", () => {
    it("ignores duplicate msg_id inserts", () => {
      const db = initDatabase(tmpDir);
      const insert = db.prepare(
        "INSERT OR IGNORE INTO channel_messages (msg_id, channel, content) VALUES (?, ?, ?)",
      );
      insert.run("msg-1", "telegram", "hello");
      insert.run("msg-1", "telegram", "duplicate");

      const count = db.prepare("SELECT COUNT(*) as cnt FROM channel_messages").get() as {
        cnt: number;
      };
      expect(count.cnt).toBe(1);

      const row = db
        .prepare("SELECT content FROM channel_messages WHERE msg_id = 'msg-1'")
        .get() as {
        content: string;
      };
      expect(row.content).toBe("hello");
      db.close();
    });
  });

  describe("project registry", () => {
    it("CRUD operations work correctly", () => {
      const registry = new ProjectRegistryManager(tmpDir);

      expect(Object.keys(registry.list())).toHaveLength(0);

      registry.add("test-project", {
        repo: "https://example.com/repo.git",
        aliases: ["tp", "test"],
        default_branch: "main",
        dev_branch: "dev",
        branches: { main: "Production", dev: "Development" },
        description: "Test project",
        jenkins_job: "test-pipeline",
      });

      expect(Object.keys(registry.list())).toHaveLength(1);

      const byId = registry.get("test-project");
      expect(byId).not.toBeNull();
      expect(byId!.project.repo).toBe("https://example.com/repo.git");

      const byAlias = registry.get("tp");
      expect(byAlias).not.toBeNull();
      expect(byAlias!.id).toBe("test-project");

      registry.update("test-project", { description: "Updated description" });
      const updated = registry.get("test-project");
      expect(updated!.project.description).toBe("Updated description");

      const removed = registry.remove("test-project");
      expect(removed).toBe(true);
      expect(Object.keys(registry.list())).toHaveLength(0);
    });

    it("throws on duplicate add", () => {
      const registry = new ProjectRegistryManager(tmpDir);
      registry.add("proj", {
        repo: "a",
        aliases: [],
        default_branch: "main",
        dev_branch: "dev",
        branches: {},
        description: "x",
        jenkins_job: "",
      });
      expect(() =>
        registry.add("proj", {
          repo: "b",
          aliases: [],
          default_branch: "main",
          dev_branch: "dev",
          branches: {},
          description: "y",
          jenkins_job: "",
        }),
      ).toThrow("already exists");
    });
  });

  describe("SOP schema validation", () => {
    it("validates a valid definition", () => {
      const def = validateSopDefinition({
        id: "test-sop",
        name: "Test SOP",
        steps: [
          { id: "step-1", name: "Step 1", skills: ["git"], tools: [], instructions: "Do stuff" },
        ],
      });
      expect(def.id).toBe("test-sop");
      expect(def.steps).toHaveLength(1);
      expect(def.steps[0].skills).toEqual(["git"]);
    });

    it("rejects definition without steps", () => {
      expect(() => validateSopDefinition({ id: "x", name: "y", steps: [] })).toThrow(
        "at least one step",
      );
    });

    it("rejects definition without id", () => {
      expect(() => validateSopDefinition({ name: "y", steps: [{ id: "s", name: "n" }] })).toThrow(
        "id",
      );
    });
  });

  describe("SOP engine", () => {
    it("starts task and advances through steps", () => {
      const db = initDatabase(tmpDir);
      const engine = new SopEngine(db, tmpDir);

      // Default definitions should be seeded
      const defs = engine.listDefinitions();
      expect(defs.length).toBeGreaterThanOrEqual(2);

      const devDef = engine.getDefinition("dev-default");
      expect(devDef).not.toBeNull();
      expect(devDef!.steps.length).toBeGreaterThan(0);

      // Start a task
      const task = engine.startTask("dev-default", "dev-agent", "test-proj");
      expect(task.status).toBe("in_progress");
      expect(task.current_step).toBe("read-requirements");
      expect(task.sop_id).toBe("dev-default");

      // Check step info
      const stepInfo = engine.getCurrentStepInfo(task.id);
      expect(stepInfo).not.toBeNull();
      expect(stepInfo!.name).toBe("阅读需求文档");

      // Check skills for current step
      const skills = engine.getCurrentStepSkills(task.id);
      expect(Array.isArray(skills)).toBe(true);

      // Advance to next step
      const { task: updated, nextStep } = engine.completeStep(task.id, { result: "ok" });
      expect(nextStep).toBe("setup-branch");
      expect(updated.current_step).toBe("setup-branch");

      // Get step logs
      const logs = engine.getTaskStepLogs(task.id);
      expect(logs.length).toBeGreaterThanOrEqual(1);
      expect(logs[0].status).toBe("completed");

      db.close();
    });

    it("marks task completed when all steps are done", () => {
      const db = initDatabase(tmpDir);
      const engine = new SopEngine(db, tmpDir);

      const task = engine.startTask("dev-default", "dev-agent");
      const devDef = engine.getDefinition("dev-default")!;

      // Advance through all steps
      for (let i = 0; i < devDef.steps.length; i++) {
        engine.completeStep(task.id);
      }

      const finalTask = engine.getTask(task.id);
      expect(finalTask!.status).toBe("completed");

      db.close();
    });

    it("fails a task with reason", () => {
      const db = initDatabase(tmpDir);
      const engine = new SopEngine(db, tmpDir);

      const task = engine.startTask("dev-default", "dev-agent");
      const failed = engine.failTask(task.id, "build error");
      expect(failed.status).toBe("failed");

      db.close();
    });

    it("saves and loads custom SOP definitions", () => {
      const db = initDatabase(tmpDir);
      const engine = new SopEngine(db, tmpDir);

      engine.saveDefinition({
        id: "custom-sop",
        name: "Custom SOP",
        steps: [
          {
            id: "s1",
            name: "Step 1",
            skills: ["skill-a"],
            tools: ["tool-b"],
            instructions: "Do A",
          },
          { id: "s2", name: "Step 2", skills: [], tools: [], instructions: "Do B" },
        ],
      });

      engine.reloadDefinitions();
      const custom = engine.getDefinition("custom-sop");
      expect(custom).not.toBeNull();
      expect(custom!.steps).toHaveLength(2);

      const deleted = engine.deleteDefinition("custom-sop");
      expect(deleted).toBe(true);

      engine.reloadDefinitions();
      expect(engine.getDefinition("custom-sop")).toBeNull();

      db.close();
    });

    it("lists tasks by agent", () => {
      const db = initDatabase(tmpDir);
      const engine = new SopEngine(db, tmpDir);

      engine.startTask("dev-default", "agent-a");
      engine.startTask("dev-default", "agent-b");
      engine.startTask("dev-default", "agent-a");

      const allTasks = engine.listTasks();
      expect(allTasks.length).toBe(3);

      const agentATasks = engine.listTasks("agent-a");
      expect(agentATasks.length).toBe(2);

      db.close();
    });
  });

  describe("plugin manifest", () => {
    it("has valid openclaw.plugin.json", () => {
      const manifestPath = path.join(__dirname, "openclaw.plugin.json");
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
      expect(manifest.id).toBe("solo-company");
      expect(manifest.name).toBe("Solo Company");
      expect(manifest.configSchema).toBeDefined();
    });
  });

  describe("plugin entry", () => {
    it("exports a valid plugin entry with register function", async () => {
      const mod = await import("./index.js");
      expect(mod.default).toBeDefined();
      expect(mod.default.id).toBe("solo-company");
      expect(typeof mod.default.register).toBe("function");
    });
  });
});
