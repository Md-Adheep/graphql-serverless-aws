# Deploying and testing

## Prerequisites

| Tool | Version | Used for |
|---|---|---|
| AWS account | admin access for the one-time bootstrap | Everything |
| AWS CLI | v2 | Bootstrap, manual checks |
| Terraform | ≥ 1.10 (CI uses 1.17.2) | Infrastructure |
| Node.js | 22 | Lambdas, server, frontend |
| Docker | any recent | Local development only (CI builds the image) |
| GitHub repo | with Actions enabled | CI/CD |

> **Cost while running** (us-east-2, defaults): NAT gateway ~$1.10/day, internal ALB ~$0.55/day,
> RDS Proxy ~$0.72/day, Fargate 1 × 0.25 vCPU arm64 ~$0.25/day, RDS db.t4g.micro ~$0.40/day
> (free tier eligible), plus cents for Lambda, AppSync, CloudFront, S3 and CloudWatch.
> **About $3–4 per day.** Tear it down when you're finished (see the end of this page).

---

## Step 1: Bootstrap (once, from your machine)

This creates the Terraform state bucket and the IAM role that GitHub Actions assumes through OIDC.

```bash
aws configure            # or: aws sso login - any admin credentials
cd infrastructure/bootstrap
terraform init
terraform apply -var="github_repository=Md-Adheep/graphql-serverless-aws"
```

Note the two outputs: `tf_state_bucket` and `github_deploy_role_arn`.

> **Existing AWS account?** If the account already has a GitHub OIDC provider (check:
> `aws iam list-open-id-connect-providers`; look for `token.actions.githubusercontent.com`),
> reuse it instead of creating a second one:
> `terraform apply -var="create_github_oidc_provider=false"`
>
> **Region:** everything deploys to **us-east-2 (Ohio)** by default. Only the optional CloudFront
> custom-domain certificate is created in us-east-1, because CloudFront requires that.

## Step 2: Configure the GitHub repository

**Settings → Secrets and variables → Actions**

| Type | Name | Value |
|---|---|---|
| Variable | `AWS_DEPLOY_ROLE_ARN` | `github_deploy_role_arn` output |
| Variable | `TF_STATE_BUCKET` | `tf_state_bucket` output |
| Variable | `AWS_REGION` | `us-east-2` |
| Variable | `DOMAIN_NAME` | *(optional)* e.g. `tasks.example.com` |
| Secret | `ALERT_EMAIL` | address that receives CloudWatch alarm emails |

**Settings → Environments → New environment → `production`**. Optionally add yourself as a
*required reviewer*. Every production deploy then pauses for approval before Terraform runs.

No AWS access keys are stored anywhere in GitHub.

## Step 3: Deploy

Push to `main` (or run **Actions → Deploy → Run workflow**). The pipeline:

1. **CI**: typecheck, unit tests, builds, `npm audit`, `terraform validate`, shellcheck, Docker build
2. **Terraform apply**: VPC, RDS, RDS Proxy, ECS, ALB, CloudFront, alarms and so on (~15 min the first time; RDS and CloudFront are the slow parts)
3. **Build image**: arm64 image tagged with the git SHA, pushed to ECR
4. **Backend**: `serverless deploy` → `migrate` Lambda → ECS rolling deploy → end-to-end smoke test
5. **Frontend**: build with the AppSync endpoint injected → S3 → CloudFront invalidation → smoke test

The app URL is in the Terraform output `frontend_url` and in SSM at `/graphql-app/prod/frontend-url`.

> **First deploy only:** Terraform creates the ECS service before any image exists, so tasks fail
> to start until step 4 deploys the first real image. This is expected, and the pipeline fixes it
> automatically.

Confirm the SNS subscription email (*"AWS Notification - Subscription Confirmation"*), or you won't receive alerts.

### Optional: custom domain

Set the `DOMAIN_NAME` variable, run the pipeline, then add the CNAME from the Terraform output
`acm_validation_records` at your DNS provider, plus a CNAME `tasks.example.com → <distribution>.cloudfront.net`.
The apply waits until the certificate is validated.

---

## Testing

### Automated (runs on every deploy)

`scripts/smoke-test.sh` runs these checks through the public API:

| Check | Proves |
|---|---|
| `query tasks` | AppSync → queries Lambda → RDS Proxy (IAM auth) → RDS |
| `mutation createTask` | AppSync → mutations Lambda → Secrets Manager → internal ALB → Fargate → RDS |
| `mutation updateTask` + `query task(id)` | The write path and the read path see the same data |
| `mutation deleteTask` | Cleanup |

The frontend job also checks HTTPS, `<div id="root">`, the HSTS and CSP headers, and that a JS asset loads.

### Manually

```bash
# AppSync endpoint + API key
export STAGE=prod
eval "$(scripts/appsync-config.sh)"

# Query
curl -s "$url" -H "x-api-key: $key" -H 'content-type: application/json' \
  -d '{"query":"{ tasks { id title status } }"}' | jq

# Mutation
curl -s "$url" -H "x-api-key: $key" -H 'content-type: application/json' \
  -d '{"query":"mutation { createTask(input:{title:\"hello\"}) { id title } }"}' | jq

# Full smoke test
scripts/smoke-test.sh
```

**Subscriptions:** open the app in two browser windows. Create, move or delete a task in one, and it
appears in the other instantly (the badge in the header shows **Live**). You can also run a
subscription from the AppSync console's *Queries* page.

**Security checks:**

```bash
# The private GraphQL server must NOT be reachable from the internet:
aws ssm get-parameter --name /graphql-app/prod/graphql-server-url --query Parameter.Value --output text
curl --max-time 5 <that url>          # → times out / does not resolve publicly

# The S3 bucket must not be publicly readable:
curl -I https://<bucket>.s3.amazonaws.com/index.html   # → 403

# RDS must not be publicly accessible:
aws rds describe-db-instances --query 'DBInstances[].PubliclyAccessible'   # → [false]
```

### Unit tests (local)

```bash
cd backend/lambdas        && npm ci && npm test   # 13 tests
cd backend/graphql-server && npm ci && npm test   # 11 tests
cd frontend               && npm ci && npm test   #  4 tests
```

---

## Local development

```bash
docker compose up --build             # PostgreSQL + private GraphQL server on :4000
curl -s localhost:4000/graphql -H 'content-type: application/json' \
     -H 'x-internal-token: local-dev-token' \
     -d '{"query":"{ tasks { id title status } }"}'
```

The same SQL files in `database/migrations/` seed the local database and are applied in AWS by
the `migrate` Lambda.

For the frontend, copy `frontend/.env.example` to `frontend/.env.local`, fill it from
`scripts/appsync-config.sh`, then run `npm run dev`.

---

## Teardown

```bash
# 1. Lambdas + AppSync
cd backend/lambdas && npx serverless remove --stage prod

# 2. Everything Terraform created (allow_destroy=true by default: no RDS final snapshot,
#    buckets and ECR force-deleted)
cd infrastructure/environments/prod
terraform init -backend-config="bucket=<TF_STATE_BUCKET>"
terraform destroy -var="alert_email=you@example.com"

# 3. (optional) the bootstrap stack - empty the state bucket first
cd ../../bootstrap && terraform destroy
```
