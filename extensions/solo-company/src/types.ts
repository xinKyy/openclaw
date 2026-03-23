export type SoloCompanyConfig = {
  dataDir?: string;
};

export type ProjectEntry = {
  repo: string;
  aliases: string[];
  default_branch: string;
  dev_branch: string;
  branches: Record<string, string>;
  description: string;
  jenkins_job: string;
};

export type ProjectRegistry = {
  projects: Record<string, ProjectEntry>;
};

export type RoleDefinition = {
  id: string;
  name: string;
  agentId: string;
  model: string;
  sopId?: string;
  description: string;
  skills?: string[];
};

export type SopStepDefinition = {
  id: string;
  name: string;
  skills: string[];
  tools: string[];
  instructions: string;
  requires?: string[];
};

export type SopDefinition = {
  id: string;
  name: string;
  description?: string;
  steps: SopStepDefinition[];
};

export type SopTaskStatus = "pending" | "in_progress" | "completed" | "failed" | "cancelled";

export type SopTask = {
  id: string;
  sop_id: string;
  agent_id: string;
  project_id: string | null;
  status: SopTaskStatus;
  current_step: string | null;
  context: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type SopStepLog = {
  id: string;
  task_id: string;
  step_id: string;
  status: string;
  input: Record<string, unknown> | null;
  output: Record<string, unknown> | null;
  started_at: string;
  completed_at: string | null;
};

export type ChannelMessage = {
  id: number;
  msg_id: string;
  channel: string;
  group_id: string | null;
  group_name: string | null;
  sender: string | null;
  sender_name: string | null;
  content: string | null;
  raw_context: string | null;
  chat_type: string | null;
  thread_id: string | null;
  created_at: string;
};
