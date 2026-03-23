---
name: jenkins-deploy
description: "Trigger Jenkins build pipelines and monitor their status. Use with project_get tool to look up the jenkins_job name. Use when: deploying to dev/staging environments, checking build status. NOT for: production deployments without explicit approval."
metadata:
  {
    "openclaw":
      { "emoji": "🏗️", "requires": { "env": ["JENKINS_URL", "JENKINS_USER", "JENKINS_TOKEN"] } },
  }
---

# Jenkins Deployment

Trigger and monitor Jenkins CI/CD pipelines using the `bash` tool with `curl`.

## Prerequisites

- `JENKINS_URL` - Jenkins server base URL (e.g. `https://jenkins.fortu.pro`)
- `JENKINS_USER` - Jenkins username
- `JENKINS_TOKEN` - Jenkins API token
- Always call `project_get` first to retrieve the `jenkins_job` name

## Trigger Build

```bash
# Trigger a parameterized build with a specific branch
bash command:"curl -s -X POST '${JENKINS_URL}/job/<jenkins_job>/buildWithParameters' \
  --user '${JENKINS_USER}:${JENKINS_TOKEN}' \
  -d 'GIT_BRANCH=<branch_name>'"
```

## Get Build Queue Info

After triggering, the build enters a queue. Check if it has started:

```bash
bash command:"curl -s '${JENKINS_URL}/job/<jenkins_job>/lastBuild/api/json' \
  --user '${JENKINS_USER}:${JENKINS_TOKEN}' \
  | jq '{number, result, building, duration, timestamp, url}'"
```

## Monitor Build Status (Poll)

Poll until `building` is `false` and `result` is available:

```bash
bash command:"curl -s '${JENKINS_URL}/job/<jenkins_job>/lastBuild/api/json' \
  --user '${JENKINS_USER}:${JENKINS_TOKEN}' \
  | jq '{result, building, duration}'"
```

- `building: true` means still running
- `result: "SUCCESS"` means build passed
- `result: "FAILURE"` means build failed

## Get Build Console Output

If a build fails, inspect the console log:

```bash
bash command:"curl -s '${JENKINS_URL}/job/<jenkins_job>/lastBuild/consoleText' \
  --user '${JENKINS_USER}:${JENKINS_TOKEN}' \
  | tail -100"
```

## Workflow Summary

1. Use `project_get` to look up the `jenkins_job` name
2. Trigger the build with the appropriate branch
3. Poll build status every 15-30 seconds until completion
4. Report result (SUCCESS/FAILURE) back to the group
5. If failed, retrieve console output to diagnose
