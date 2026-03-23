import fs from "node:fs";
import path from "node:path";
import type { ProjectEntry, ProjectRegistry } from "../types.js";

const PROJECTS_FILE = "projects.json";

export class ProjectRegistryManager {
  private filePath: string;

  constructor(dataDir: string) {
    this.filePath = path.join(dataDir, PROJECTS_FILE);
    this.ensureFile();
  }

  private ensureFile(): void {
    if (!fs.existsSync(this.filePath)) {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      fs.writeFileSync(this.filePath, JSON.stringify({ projects: {} }, null, 2));
    }
  }

  private read(): ProjectRegistry {
    const raw = fs.readFileSync(this.filePath, "utf-8");
    return JSON.parse(raw) as ProjectRegistry;
  }

  private write(data: ProjectRegistry): void {
    fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2));
  }

  list(): Record<string, ProjectEntry> {
    return this.read().projects;
  }

  get(idOrAlias: string): { id: string; project: ProjectEntry } | null {
    const registry = this.read();
    // Direct lookup
    if (registry.projects[idOrAlias]) {
      return { id: idOrAlias, project: registry.projects[idOrAlias] };
    }
    // Alias lookup
    for (const [id, proj] of Object.entries(registry.projects)) {
      if (proj.aliases?.includes(idOrAlias)) {
        return { id, project: proj };
      }
    }
    return null;
  }

  add(id: string, project: ProjectEntry): void {
    const registry = this.read();
    if (registry.projects[id]) {
      throw new Error(`Project "${id}" already exists.`);
    }
    registry.projects[id] = project;
    this.write(registry);
  }

  update(id: string, updates: Partial<ProjectEntry>): void {
    const registry = this.read();
    const existing = registry.projects[id];
    if (!existing) {
      throw new Error(`Project "${id}" not found.`);
    }
    registry.projects[id] = { ...existing, ...updates };
    this.write(registry);
  }

  remove(id: string): boolean {
    const registry = this.read();
    if (!registry.projects[id]) return false;
    delete registry.projects[id];
    this.write(registry);
    return true;
  }
}
