#!/usr/bin/env bash
# Prints the timestamp of the most recent Serverless deployment (the "last known good"
# version before a new deploy), or nothing on the very first deploy.
# Used by CI to run:  serverless rollback --timestamp <value>
set -euo pipefail

STAGE="${STAGE:-prod}"
SERVICE="graphql-app-lambdas"
STACK="${SERVICE}-${STAGE}"

BUCKET=$(aws cloudformation describe-stacks --stack-name "$STACK" \
  --query "Stacks[0].Outputs[?OutputKey=='ServerlessDeploymentBucketName'].OutputValue" \
  --output text 2>/dev/null || true)

if [[ -z "$BUCKET" || "$BUCKET" == "None" ]]; then
  exit 0 # stack doesn't exist yet -> nothing to roll back to
fi

# Deployment artifacts are stored as serverless/<service>/<stage>/<epoch-ms>-<iso-date>/
aws s3api list-objects-v2 --bucket "$BUCKET" --prefix "serverless/${SERVICE}/${STAGE}/" --delimiter / \
  --query 'CommonPrefixes[].Prefix' --output text \
  | tr '\t' '\n' \
  | sed -E 's#^.*/([0-9]+)-[^/]*/$#\1#' \
  | grep -E '^[0-9]+$' \
  | sort -n \
  | tail -1 || true
