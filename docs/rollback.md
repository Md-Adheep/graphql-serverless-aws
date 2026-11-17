# Rollback strategy

## Goal

Every production deploy either **fully succeeds and passes the smoke tests**, or **returns
automatically to the previous working version**, without anyone having to intervene.

## Rollback layers

| Component | Automatic, during the deploy | Automatic, by AWS | Manual (`rollback.yml`) |
|---|---|---|---|
| **Lambdas + AppSync** (Serverless Framework) | On any failure after deploy (migration, ECS, smoke test): `serverless rollback --timestamp <last-good>` | CloudFormation rolls back a failed stack update by itself | Pick any of the last 10 deployments |
| **ECS Fargate** | On failure: `update-service --task-definition <last-good>` + wait for stability | **Deployment circuit breaker** (`rollback = true`): if new tasks fail health checks, ECS reverts on its own | Pick any task definition revision |
| **Frontend** | On a failed smoke test: re-publish the previous release from the releases bucket | — | Pick any archived release by git SHA |
| **Infrastructure** (Terraform) | Plan-then-apply of the exact reviewed plan | Per-resource operations. State history in a versioned S3 bucket. | `git revert` + pipeline (roll **forward** to the previous config) |
| **Database schema** | Each migration runs in a transaction. A failed migration rolls back and blocks the deploy. | Point-in-time restore (7 days) | Expand/contract migrations keep the old app compatible |

## How "last known good" is tracked

| Component | Recorded **before** deploying | Stored where |
|---|---|---|
| Lambdas | Latest deployment timestamp (`scripts/sls-latest-timestamp.sh` reads the Serverless deployment bucket) | Serverless deployment bucket keeps the last **10** artifacts (`maxPreviousDeploymentArtifacts`) |
| ECS | `services[0].taskDefinition` ARN | ECS keeps all task definition revisions. ECR keeps 20 **immutable** SHA-tagged images. |
| Frontend | `frontend/LAST_GOOD` (a git SHA), written only **after** the smoke test passes | `s3://graphql-app-prod-releases-<acct>/frontend/releases/<sha>/` (90-day retention) |

Because image tags are immutable and frontend releases are stored per SHA, a rollback restores the
**exact** previous artifacts. Nothing is rebuilt.

## Automatic flow in `deploy.yml` (backend)

```
record previous (task def ARN, sls timestamp)
        │
serverless deploy ──fail──▶ CloudFormation auto-rollback ─┐
        │                                                 │
migrate ─────────────fail─────────────────────────────────┤
        │                                                 │
ECS deploy (circuit breaker) ──fail──────────────────────┤
        │                                                 ▼
verify new revision running ──fail──▶  if: failure()
        │                               ├─ serverless rollback --timestamp <prev>
smoke test ──────────fail────────────▶  └─ ecs update-service --task-definition <prev>
        │                                    (job still fails → frontend never deploys)
        ▼
frontend job runs
```

Notes:

- Rollback steps only run if their component was actually deployed (`steps.<id>.outcome != 'skipped'`).
- The job is still marked **failed** after a rollback, so the team is notified and the frontend job (`needs: deploy-backend`) doesn't run.
- The *verify new revision* step catches a subtle case: the ECS circuit breaker reverts, the service becomes "stable" on the old revision, and the deploy action reports success.

## Manual rollback

**Actions → Rollback → Run workflow**

1. Choose the component (`lambdas`, `ecs` or `frontend`) and leave **target** empty. The run
   **lists** the available versions (deployment timestamps, task definition revisions, or release SHAs).
2. Run it again with the chosen **target**. The workflow rolls back, waits for stability, and runs the smoke test.

It uses the same `deploy-prod` concurrency lock, so it can never run at the same time as a deploy.

CLI equivalents:

```bash
# Lambdas / AppSync
cd backend/lambdas
npx serverless deploy list --stage prod
npx serverless rollback --timestamp 1763380000000 --stage prod

# ECS
aws ecs list-task-definitions --family-prefix graphql-app-prod-graphql-server --sort DESC
aws ecs update-service --cluster graphql-app-prod --service graphql-server \
  --task-definition graphql-app-prod-graphql-server:12

# Frontend
aws s3 ls s3://graphql-app-prod-releases-<acct>/frontend/releases/
aws s3 sync s3://graphql-app-prod-releases-<acct>/frontend/releases/<sha>/ ./rb
scripts/frontend-publish.sh ./rb <site-bucket> <distribution-id>
```

## Database caveat

Code rollbacks don't undo schema changes. Migrations are therefore written **backwards-compatible**
(*expand → migrate → contract*): a release only *adds* (nullable columns, new tables, new indexes),
and destructive changes ship in a later release once no running version needs the old shape. If
data itself is damaged, use RDS point-in-time restore (see [database.md](database.md)).
