# Monitoring and alerting (CloudWatch)

## What is collected

| Source | Logs | Metrics | Tracing |
|---|---|---|---|
| Lambda (4 functions) | `/aws/lambda/graphql-app-lambdas-prod-*`, structured JSON, 30-day retention | Invocations, Errors, Duration, Throttles, ConcurrentExecutions | X-Ray (active) |
| AppSync | Error-level resolver logs, 30 days | 4XX/5XX errors, Latency, connect and subscribe counts | X-Ray |
| ECS Fargate | `/ecs/graphql-app-prod/graphql-server`, structured JSON, 30 days | CPU, Memory, **Container Insights** (per-task, RunningTaskCount) | — |
| Internal ALB | — | RequestCount, TargetResponseTime, 5XX, UnHealthyHostCount | — |
| RDS | `postgresql` (slow queries > 1 s, connections) and `upgrade` | CPU, DatabaseConnections, FreeStorageSpace, FreeableMemory, plus enhanced monitoring (OS metrics, 60 s) | — |
| RDS Proxy | — | ClientConnections, DatabaseConnections | — |
| VPC | Flow logs (REJECT), 14 days | — | — |

Logs are JSON, so they work directly in **CloudWatch Logs Insights**:

```
fields @timestamp, fieldName, durationMs, requestId
| filter level = "error" or durationMs > 1000
| sort @timestamp desc
```

The `requestId` from the Lambda is forwarded to the Fargate server in the `x-request-id` header,
so one request can be followed across both log groups.

## Alarms (21 in total) → SNS → email

All alarms send **ALARM** and **OK** notifications to the `graphql-app-prod-alarms` SNS topic.

### Lambda and AppSync (`backend/lambdas/serverless.yml`)

| Alarm | Condition | Meaning |
|---|---|---|
| `queries-errors` / `mutations-errors` / `subscriptions-errors` | ≥ 5 errors in 5 min | Function errors |
| `migrate-errors` | ≥ 1 error | A migration failed |
| `queries-latency-p95` / `mutations-latency-p95` | p95 > 3 s (2 of 3 periods) | Latency |
| `throttles` | ≥ 1 throttle | Concurrency limit reached |
| `queries-invocations-spike` | > 10,000 invocations per 5 min | Abnormal traffic or a runaway client |
| `appsync-5xx` | ≥ 5 in 5 min | API server errors |
| `appsync-latency-p95` | p95 > 2 s | End-to-end API latency |

### ECS, ALB, RDS and Proxy (`infrastructure/modules/monitoring`)

| Alarm | Condition | Meaning |
|---|---|---|
| `ecs-cpu-high` | > 80% for 3 min | Autoscaling isn't keeping up |
| `ecs-memory-high` | > 85% for 3 min | Memory leak or under-sized tasks |
| `ecs-no-running-tasks` | < 1 running task (missing data = breaching) | **Write path down** |
| `alb-target-5xx` | ≥ 5 per minute | Server errors |
| `alb-unhealthy-targets` | > 0 for 2 min | Tasks failing health checks |
| `alb-latency-p95` | p95 > 1 s (3 of 5 min) | Slow server |
| `rds-cpu-high` | > 80% for 3 min | Needs a bigger instance or a read replica |
| `rds-connections-high` | > 60 connections | Approaching the `db.t4g.micro` limit (~80) |
| `rds-free-storage-low` | < 2 GiB | Storage autoscaling should kick in. Investigate if it doesn't. |
| `rds-freeable-memory-low` | < 64 MiB | Memory pressure |
| `rds-proxy-client-connections-high` | > 500 | Lambda concurrency surge |

## Dashboard

`graphql-app-prod` (link in the Terraform output `dashboard_url`) shows Lambda invocations, errors
and p95, ECS CPU/memory and running tasks, ALB requests and 5xx, RDS CPU, **DB connections
(instance vs. proxy clients)** side by side to show what pooling is doing, and free storage.

## Triage guide

| Alert | First look | Typical fix |
|---|---|---|
| `mutations-errors` + `alb-unhealthy-targets` | ECS log group, task stop reasons | Roll back ECS (`rollback.yml`, component `ecs`) |
| `queries-errors` only | Lambda logs → DB errors? | Check the proxy and RDS metrics. Roll back the Lambdas. |
| `rds-connections-high` | Dashboard: proxy clients vs. DB connections | Lower Lambda concurrency or raise `max_connections_percent` |
| `throttles` | Lambda ConcurrentExecutions | Request an account concurrency increase |
| `ecs-no-running-tasks` | ECS events | Usually a failing image. The circuit breaker should already have reverted it. |
