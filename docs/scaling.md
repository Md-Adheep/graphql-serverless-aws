# Scaling strategy

Each tier scales independently. The defaults keep idle cost minimal, and every limit is a single
Terraform variable or `serverless.yml` value.

## Lambda

| Mechanism | Configuration |
|---|---|
| Horizontal scaling | Automatic: one execution environment per concurrent request, up to the account concurrency limit (1,000 by default) |
| Protecting the database from that burst | **RDS Proxy.** Each Lambda container holds at most 1 connection (`max: 1`), and the proxy multiplexes them onto ≤ 90% of `max_connections`. Clients wait up to 120 s for a free connection instead of failing. |
| Cost per request | arm64 (Graviton), 512 MB (256 MB for `subscriptions`), esbuild-minified bundles (~0.5 MB) for fast cold starts |
| Monitoring | `throttles` and `invocations-spike` alarms |

**Optional controls** (not enabled by default because new AWS accounts often have a concurrency
quota of only 10, and reserving any of it fails the deploy):

```yaml
# serverless.yml - cap a function so it can never starve others or overload the DB
functions:
  queries:
    reservedConcurrency: 50
    # Pre-warmed instances for latency-sensitive traffic (billed hourly):
    provisionedConcurrency: 2
```

Provisioned concurrency can itself be auto-scaled with Application Auto Scaling target tracking
on `LambdaProvisionedConcurrencyUtilization` (for example, target 0.7), scheduled for business hours.

## ECS Fargate (private GraphQL server)

| Setting | Value |
|---|---|
| Min / max tasks | 1 / 4 (`ecs_min_capacity`, `ecs_max_capacity`) |
| Policy 1 | Target tracking **CPU 60%** |
| Policy 2 | Target tracking **memory 75%** |
| Policy 3 | Target tracking **ALB requests per target: 500/min** |
| Cooldowns | Scale-out 60 s (react fast), scale-in 300 s (avoid flapping) |
| Capacity mix | `FARGATE` base 1 (always-on baseline) and `FARGATE_SPOT` weight 3. Extra tasks run on Spot (**up to 70% cheaper**). The service is stateless and the ALB drains interrupted tasks in 30 s. |
| Task size | 0.25 vCPU / 512 MB, ARM64 |

With several target-tracking policies, ECS scales **out** if *any* policy asks for it and only
scales **in** when *all* of them agree, which is the safe behaviour.

## RDS

| Dimension | How |
|---|---|
| Storage | **Storage autoscaling** from 20 GiB to `max_allocated_storage` (100 GiB) with no downtime |
| Connections | RDS Proxy pooling (see above). This is the main thing that lets a small instance serve a serverless front end. |
| Read throughput | `db_create_read_replica = true` adds a replica. Point the `queries` Lambda (read path) at a read-only proxy endpoint. |
| Write throughput / CPU | Vertical: change `db_instance_class` (e.g. `db.t4g.medium` → `db.m7g.large`). Applied in the maintenance window, or immediately with Multi-AZ for minimal downtime. |
| Availability | `db_multi_az = true` |

### Why replicas aren't auto-scaled here

Plain RDS **doesn't support replica auto scaling**. Only **Aurora** does
(`aws_appautoscaling_target` with `rds:cluster:ReadReplicaCount`). The brief says *"read replicas
(if required)"*, so for this workload size the cost-effective choice is:

1. Start with one small instance and RDS Proxy.
2. Watch the `rds-cpu-high` and `rds-connections-high` alarms.
3. Add a replica with one variable when read load justifies it.
4. If traffic becomes spiky and large, migrate to **Aurora Serverless v2** (ACU-based auto scaling
   of writer and readers). The application needs no code changes, only a new proxy target.

The Aurora version of the replica scaling policy would be:

```hcl
resource "aws_appautoscaling_target" "replicas" {
  service_namespace  = "rds"
  resource_id        = "cluster:${aws_rds_cluster.this.id}"
  scalable_dimension = "rds:cluster:ReadReplicaCount"
  min_capacity       = 1
  max_capacity       = 5
}
resource "aws_appautoscaling_policy" "replicas_cpu" {
  name               = "replica-cpu"
  policy_type        = "TargetTrackingScaling"
  service_namespace  = "rds"
  resource_id        = aws_appautoscaling_target.replicas.resource_id
  scalable_dimension = aws_appautoscaling_target.replicas.scalable_dimension
  target_tracking_scaling_policy_configuration {
    target_value = 60
    predefined_metric_specification { predefined_metric_type = "RDSReaderAverageCPUUtilization" }
  }
}
```

## AppSync, CloudFront and S3

Fully managed and scale automatically. AppSync manages WebSocket connections and subscription
fan-out (millions of connections) with no capacity planning. CloudFront absorbs static traffic at the edge.

## Cost-effectiveness summary

| Choice | Saving |
|---|---|
| Graviton (arm64) for Lambda and Fargate | ~20% |
| Fargate Spot for scaled-out tasks | up to 70% on burst capacity |
| Single NAT gateway (switch for HA) | ~$32/month per AZ |
| S3 gateway endpoint (free) for ECR layer pulls | NAT data-processing charges |
| CloudFront `PriceClass_100`, long-lived asset caching | Fewer edge locations and origin requests |
| `db.t4g.micro` + proxy instead of a bigger instance for connection headroom | ~4x cheaper than sizing for connections |
| Log retention 14–30 days, ECR keeps 20 images, old frontend releases expire after 90 days | Storage growth bounded |
