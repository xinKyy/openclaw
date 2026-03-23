---
name: project-workflow
description: "End-to-end project development workflow guide. Orchestrates project_get, gitlab-ops, coding-agent, jenkins-deploy, and gitlab-mr skills for a complete feature development or bug fix cycle. Use when: starting a new development task that spans multiple steps."
metadata: { "openclaw": { "emoji": "📋" } }
---

# Project Development Workflow

This skill guides you through the complete development workflow, orchestrating other tools and skills.

## Available Tools

- `project_get` / `project_list` - Look up project configuration
- `sop_start` / `sop_next` / `sop_status` - Track task progress through SOP steps
- `message_query` - Search conversation history for requirements and context
- `role_list` / `role_get` - Check team composition and responsibilities

## Available Skills (used within steps)

- `gitlab-ops` - Git clone, branch, commit, push
- `coding-agent` - Delegate coding to Codex/Claude Code
- `jenkins-deploy` - Trigger Jenkins builds
- `gitlab-mr` - Create GitLab merge requests

## Standard Development Flow

### 1. Gather Requirements

```
Use message_query to search for relevant discussions:
- Query recent messages in the project group
- Look for requirement keywords, feature requests, or bug reports
- Summarize the requirements before proceeding
```

### 2. Look Up Project Info

```
Use project_get with the project ID or alias to retrieve:
- repo: Git repository URL
- default_branch: Production branch
- dev_branch: Development branch
- jenkins_job: CI/CD pipeline name
- branches: Available branches and their purposes
```

### 3. Set Up Repository

Using `gitlab-ops` skill:

- Clone the repository (if not already available locally)
- Checkout the dev branch and pull latest
- Create a new feature/fix branch

### 4. Develop

Using `coding-agent` skill:

- Start Codex or Claude Code in the project directory
- Provide clear requirements from step 1
- Monitor coding progress
- Review the changes

### 5. Deploy to Dev

Using `jenkins-deploy` skill:

- Trigger Jenkins build with the feature branch
- Monitor build status
- Report result to the team

### 6. Notify Testers

- Send a message in the group chat notifying QA that the feature is deployed to dev
- Include: branch name, what was changed, and dev environment URL

### 7. Submit Merge Request

Using `gitlab-mr` skill:

- Create an MR from the feature branch to the dev branch
- Include a clear title and description
- Share the MR URL in the group

## New Project Flow

If starting a completely new project:

1. Create the repository on GitLab
2. Use `project_add` to register it in the project registry
3. Follow the standard development flow above

## Tips

- Always use `project_get` before any git/deploy operation to ensure correct config
- Track progress with SOP tools if an SOP flow is active
- Report status updates in the group chat at each major step
- If a step fails, log the error and notify the team before retrying
