---
name: gitlab-mr
description: "Create and manage GitLab merge requests via the GitLab API. Use with project_get to retrieve repo info. Use when: submitting code for review, creating MRs from feature/fix branches. NOT for: git operations (use gitlab-ops), deployment (use jenkins-deploy)."
metadata: { "openclaw": { "emoji": "🔀", "requires": { "env": ["GITLAB_URL", "GITLAB_TOKEN"] } } }
---

# GitLab Merge Request Operations

Create and manage merge requests using the GitLab REST API via `bash` and `curl`.

## Prerequisites

- `GITLAB_URL` - GitLab server base URL (e.g. `https://gitlabs.fortu.pro`)
- `GITLAB_TOKEN` - GitLab personal access token with `api` scope
- Always call `project_get` first to retrieve the repository URL

## Extract Project Path

From the repo URL `https://gitlabs.fortu.pro/web/fortune-web.git`, extract the project path `web/fortune-web` and URL-encode it as `web%2Ffortune-web`.

```bash
# URL-encode the project path
bash command:"echo 'web/fortune-web' | jq -sRr @uri"
```

## Create Merge Request

```bash
bash command:"curl -s -X POST '${GITLAB_URL}/api/v4/projects/<url_encoded_project_path>/merge_requests' \
  -H 'PRIVATE-TOKEN: ${GITLAB_TOKEN}' \
  -H 'Content-Type: application/json' \
  -d '{
    \"source_branch\": \"<source_branch>\",
    \"target_branch\": \"<target_branch>\",
    \"title\": \"<mr_title>\",
    \"description\": \"<mr_description>\",
    \"remove_source_branch\": true
  }'"
```

## List Open Merge Requests

```bash
bash command:"curl -s '${GITLAB_URL}/api/v4/projects/<url_encoded_project_path>/merge_requests?state=opened' \
  -H 'PRIVATE-TOKEN: ${GITLAB_TOKEN}' \
  | jq '.[] | {iid, title, source_branch, target_branch, author: .author.name, web_url}'"
```

## Check MR Status

```bash
bash command:"curl -s '${GITLAB_URL}/api/v4/projects/<url_encoded_project_path>/merge_requests/<mr_iid>' \
  -H 'PRIVATE-TOKEN: ${GITLAB_TOKEN}' \
  | jq '{iid, title, state, merge_status, has_conflicts, web_url}'"
```

## Workflow Summary

1. Use `project_get` to get repo URL and branch names
2. Extract and URL-encode the project path from the repo URL
3. Create the MR from feature/fix branch to dev branch
4. Report the MR URL back to the group
5. If conflicts, notify the team
