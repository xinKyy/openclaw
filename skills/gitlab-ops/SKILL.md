---
name: gitlab-ops
description: "GitLab repository operations: clone, branch, commit, push. Use with the project_get tool to look up repo URLs, branch names, and other project config before performing git operations. NOT for: creating merge requests (use gitlab-mr skill), CI/CD operations (use jenkins-deploy skill)."
metadata:
  { "openclaw": { "emoji": "🦊", "requires": { "bins": ["git"], "env": ["GITLAB_TOKEN"] } } }
---

# GitLab Repository Operations

Perform git operations on GitLab-hosted repositories using the `bash` tool.

## Prerequisites

- `GITLAB_TOKEN` environment variable must be set with a GitLab personal access token
- Always call `project_get` first to retrieve the repo URL, branches, and other metadata

## Clone Repository

```bash
# Clone with token-based auth
bash command:"git clone https://oauth2:${GITLAB_TOKEN}@gitlabs.fortu.pro/web/<project>.git <workspace_path>"
```

Replace `<project>` and `<workspace_path>` with actual values from `project_get`.

## Create Feature Branch

```bash
# Checkout the dev branch, pull latest, then create a new feature branch
bash workdir:<project_path> command:"git checkout <dev_branch> && git pull origin <dev_branch> && git checkout -b feature/<feature_name>"
```

## Create Fix Branch

```bash
bash workdir:<project_path> command:"git checkout <dev_branch> && git pull origin <dev_branch> && git checkout -b fix/<fix_name>"
```

## Stage, Commit, and Push

```bash
bash workdir:<project_path> command:"git add -A && git commit -m '<commit_message>' && git push -u origin <branch_name>"
```

## Check Current Branch and Status

```bash
bash workdir:<project_path> command:"git branch --show-current && git status --short"
```

## Pull Latest Changes

```bash
bash workdir:<project_path> command:"git pull origin <branch_name>"
```

## Workflow Summary

1. Use `project_get` to look up repo info (URL, default_branch, dev_branch)
2. Clone the repository (if not already cloned)
3. Create a feature/fix branch from the dev branch
4. Make changes (use the `coding-agent` skill for code writing)
5. Stage, commit, and push
6. Create an MR (use the `gitlab-mr` skill)
