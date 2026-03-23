import type { RoleDefinition } from "../types.js";

export type RolesConfig = {
  roles: RoleDefinition[];
};

export const DEFAULT_ROLES: RoleDefinition[] = [
  {
    id: "pm",
    name: "产品经理",
    agentId: "pm",
    model: "sonnet-4.6",
    sopId: "pm-default",
    description: "负责需求分析、任务拆解和项目管理",
    skills: ["project-workflow"],
  },
  {
    id: "dev",
    name: "开发工程师",
    agentId: "dev",
    model: "sonnet-4.6",
    sopId: "dev-default",
    description: "负责代码开发、部署和提交MR",
    skills: ["coding-agent", "gitlab-ops", "jenkins-deploy", "gitlab-mr", "project-workflow"],
  },
];
