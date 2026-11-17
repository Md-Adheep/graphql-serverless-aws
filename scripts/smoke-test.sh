#!/usr/bin/env bash
# End-to-end smoke test through the PUBLIC AppSync API. Exercises every layer:
#   read  path: AppSync -> queries Lambda   -> RDS Proxy -> RDS
#   write path: AppSync -> mutations Lambda -> internal ALB -> Fargate GraphQL server -> RDS Proxy -> RDS
# Exit code != 0 makes the GitHub Actions job fail, which triggers the automatic rollback steps.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
url="" key=""
eval "$("${SCRIPT_DIR}/appsync-config.sh")"   # sets $url, $realtime and $key

gql() {
  local payload="$1"
  curl -sS --max-time 20 -X POST "$url" \
    -H 'content-type: application/json' \
    -H "x-api-key: ${key}" \
    -d "$payload"
}

expect_ok() {
  local name="$1" response="$2"
  if ! echo "$response" | jq -e '.data != null and (.errors == null)' >/dev/null 2>&1; then
    echo "FAIL: ${name}"
    echo "$response"
    exit 1
  fi
  echo "PASS: ${name}"
}

# 1. Read path (retry a few times: first invocations after deploy include Lambda cold starts)
for attempt in 1 2 3 4 5; do
  R=$(gql '{"query":"{ tasks(limit: 5) { id title status } }"}' || true)
  if echo "$R" | jq -e '.data.tasks != null' >/dev/null 2>&1; then break; fi
  echo "read attempt ${attempt} failed, retrying in 5s..."
  sleep 5
done
expect_ok "query tasks (Lambda -> RDS)" "$R"

# 2. Write path - create
TITLE="smoke-test ${GITHUB_SHA:-local} $(date +%s)"
R=$(gql "$(jq -nc --arg t "$TITLE" '{query:"mutation($t:String!){ createTask(input:{title:$t}){ id title status } }", variables:{t:$t}}')")
expect_ok "createTask (Lambda -> Fargate -> RDS)" "$R"
ID=$(echo "$R" | jq -r '.data.createTask.id')

# 3. Update
R=$(gql "$(jq -nc --arg id "$ID" '{query:"mutation($id:ID!){ updateTask(id:$id, input:{status:DONE}){ id status } }", variables:{id:$id}}')")
expect_ok "updateTask" "$R"
[[ "$(echo "$R" | jq -r '.data.updateTask.status')" == "DONE" ]] || { echo "FAIL: status not updated"; exit 1; }

# 4. Read it back through the read path (proves both paths hit the same database)
R=$(gql "$(jq -nc --arg id "$ID" '{query:"query($id:ID!){ task(id:$id){ id status } }", variables:{id:$id}}')")
expect_ok "query task by id" "$R"
[[ "$(echo "$R" | jq -r '.data.task.status')" == "DONE" ]] || { echo "FAIL: read path did not see the write"; exit 1; }

# 5. Clean up
R=$(gql "$(jq -nc --arg id "$ID" '{query:"mutation($id:ID!){ deleteTask(id:$id){ id } }", variables:{id:$id}}')")
expect_ok "deleteTask" "$R"

echo "All smoke tests passed."
