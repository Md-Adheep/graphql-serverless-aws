#!/usr/bin/env bash
# Prints the deployed AppSync endpoint configuration as key=value lines:
#   url=...  realtime=...  key=...
# Usage:  eval "$(scripts/appsync-config.sh)"     or     scripts/appsync-config.sh >> "$GITHUB_OUTPUT"
# Note: the AppSync API key is a *public* client identifier (it ships inside the JS bundle).
set -euo pipefail

STAGE="${STAGE:-prod}"
API_NAME="graphql-app-${STAGE}"

API_ID=$(aws appsync list-graphql-apis --query "graphqlApis[?name=='${API_NAME}'].apiId | [0]" --output text)
if [[ -z "$API_ID" || "$API_ID" == "None" ]]; then
  echo "AppSync API '${API_NAME}' not found" >&2
  exit 1
fi

URL=$(aws appsync get-graphql-api --api-id "$API_ID" --query 'graphqlApi.uris.GRAPHQL' --output text)
REALTIME=$(aws appsync get-graphql-api --api-id "$API_ID" --query 'graphqlApi.uris.REALTIME' --output text)
# Newest key (keys are rotated by adding a new one in serverless.yml, then removing the old one)
KEY=$(aws appsync list-api-keys --api-id "$API_ID" --query 'sort_by(apiKeys, &expires)[-1].id' --output text)

echo "url=${URL}"
echo "realtime=${REALTIME}"
echo "key=${KEY}"
