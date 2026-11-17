#!/usr/bin/env bash
# Publishes a built frontend directory to the S3 site bucket and invalidates CloudFront.
# Used for normal deploys AND for rollbacks (publish an older release directory).
#   scripts/frontend-publish.sh <dir> <bucket> <distribution-id>
set -euo pipefail

DIR="$1"
BUCKET="$2"
DISTRIBUTION_ID="$3"

[[ -f "${DIR}/index.html" ]] || { echo "No index.html in ${DIR}" >&2; exit 1; }

# 1) Content-hashed assets first, cached for a year at the edge and in browsers.
#    Uploaded BEFORE index.html so the new HTML never references files that don't exist yet.
#    Old assets are intentionally kept so users holding a previous index.html keep working.
if [[ -d "${DIR}/assets" ]]; then
  aws s3 sync "${DIR}/assets" "s3://${BUCKET}/assets" \
    --cache-control "public, max-age=31536000, immutable"
fi

# 2) Everything else (index.html etc.) must always be revalidated.
aws s3 sync "${DIR}" "s3://${BUCKET}" \
  --exclude "assets/*" \
  --cache-control "no-cache" \
  --delete

# 3) Purge the HTML shell from CloudFront edges and wait until it is live.
INVALIDATION_ID=$(aws cloudfront create-invalidation \
  --distribution-id "$DISTRIBUTION_ID" \
  --paths "/" "/index.html" \
  --query 'Invalidation.Id' --output text)
aws cloudfront wait invalidation-completed --distribution-id "$DISTRIBUTION_ID" --id "$INVALIDATION_ID"
echo "Published ${DIR} -> s3://${BUCKET} (invalidation ${INVALIDATION_ID})"
