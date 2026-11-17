# Private GraphQL server on ECS Fargate.
#   * Tasks run in PRIVATE subnets with no public IP.
#   * Fronted by an INTERNAL Application Load Balancer (no internet-facing listener exists).
#   * Only the Lambda security group can reach the ALB; only the ALB can reach the tasks.
#   * Task role = least privilege (rds-db:connect only). Execution role = pull image, read 1 secret, write logs.

data "aws_caller_identity" "current" {}

locals {
  container_name = "graphql-server"
  container_port = 4000
  account_id     = data.aws_caller_identity.current.account_id
}

# ---------------- ECR ----------------
resource "aws_ecr_repository" "this" {
  name                 = "${var.name}/graphql-server"
  image_tag_mutability = "IMMUTABLE" # a tag (git SHA) always points to the same image -> reliable rollbacks
  force_delete         = var.force_delete_ecr

  image_scanning_configuration {
    scan_on_push = true
  }
  encryption_configuration {
    encryption_type = "AES256"
  }
}

resource "aws_ecr_lifecycle_policy" "this" {
  repository = aws_ecr_repository.this.name
  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep the last 20 images (enough history to roll back)"
      selection    = { tagStatus = "any", countType = "imageCountMoreThan", countNumber = 20 }
      action       = { type = "expire" }
    }]
  })
}

# ---------------- Logs ----------------
resource "aws_cloudwatch_log_group" "this" {
  name              = "/ecs/${var.name}/graphql-server"
  retention_in_days = var.log_retention_days
}

# ---------------- Cluster ----------------
resource "aws_ecs_cluster" "this" {
  name = var.name
  setting {
    name  = "containerInsights"
    value = "enabled" # per-task CPU/memory/network metrics in CloudWatch
  }
}

resource "aws_ecs_cluster_capacity_providers" "this" {
  cluster_name       = aws_ecs_cluster.this.name
  capacity_providers = ["FARGATE", "FARGATE_SPOT"]
}

# ---------------- IAM ----------------
data "aws_iam_policy_document" "ecs_tasks_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [local.account_id]
    }
  }
}

# Execution role: used by the ECS agent (pull image, push logs, fetch secrets at task start).
resource "aws_iam_role" "execution" {
  name               = "${var.name}-ecs-execution"
  assume_role_policy = data.aws_iam_policy_document.ecs_tasks_assume.json
}

resource "aws_iam_role_policy_attachment" "execution_managed" {
  role       = aws_iam_role.execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role_policy" "execution_secrets" {
  name = "read-internal-token"
  role = aws_iam_role.execution.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["secretsmanager:GetSecretValue"]
      Resource = var.internal_token_secret_arn
    }]
  })
}

# Task role: what the application code itself may do. Only: connect to the DB via the proxy as app user.
resource "aws_iam_role" "task" {
  name               = "${var.name}-ecs-task"
  assume_role_policy = data.aws_iam_policy_document.ecs_tasks_assume.json
}

resource "aws_iam_role_policy" "task_db" {
  name = "rds-iam-connect"
  role = aws_iam_role.task.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["rds-db:connect"]
      Resource = "arn:aws:rds-db:${var.aws_region}:${local.account_id}:dbuser:${var.db_proxy_resource_id}/${var.db_username}"
    }]
  })
}

# ---------------- Task definition ----------------
# CI/CD registers new revisions (new image tag) from this baseline; Terraform ignores
# task_definition drift on the service so the two never fight.
resource "aws_ecs_task_definition" "this" {
  family                   = "${var.name}-graphql-server"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.cpu
  memory                   = var.memory
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.task.arn

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "ARM64" # Graviton: ~20% cheaper per vCPU-hour
  }

  container_definitions = jsonencode([{
    name                   = local.container_name
    image                  = "${aws_ecr_repository.this.repository_url}:${var.image_tag}"
    essential              = true
    readonlyRootFilesystem = true
    portMappings           = [{ containerPort = local.container_port, protocol = "tcp" }]
    environment = [
      { name = "PORT", value = tostring(local.container_port) },
      { name = "NODE_ENV", value = "production" },
      { name = "DB_HOST", value = var.db_proxy_endpoint },
      { name = "DB_PORT", value = "5432" },
      { name = "DB_NAME", value = var.db_name },
      { name = "DB_USER", value = var.db_username },
      { name = "DB_AUTH_MODE", value = "iam" },
      { name = "DB_POOL_MAX", value = "10" },
      { name = "ENABLE_INTROSPECTION", value = "false" },
    ]
    # Injected from Secrets Manager at task start - never stored in the task definition.
    secrets = [
      { name = "INTERNAL_API_TOKEN", valueFrom = var.internal_token_secret_arn },
    ]
    healthCheck = {
      command     = ["CMD-SHELL", "wget -qO- http://127.0.0.1:${local.container_port}/health || exit 1"]
      interval    = 30
      timeout     = 5
      retries     = 3
      startPeriod = 20
    }
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.this.name
        awslogs-region        = var.aws_region
        awslogs-stream-prefix = "app"
      }
    }
    stopTimeout = 30
  }])
}

# ---------------- Internal ALB ----------------
resource "aws_lb" "this" {
  name                       = substr("${var.name}-int", 0, 32)
  internal                   = true
  load_balancer_type         = "application"
  subnets                    = var.private_subnet_ids
  security_groups            = [var.alb_security_group_id]
  drop_invalid_header_fields = true
  idle_timeout               = 30
}

resource "aws_lb_target_group" "this" {
  name                 = substr("${var.name}-gql", 0, 32)
  port                 = local.container_port
  protocol             = "HTTP"
  target_type          = "ip"
  vpc_id               = var.vpc_id
  deregistration_delay = 30

  health_check {
    path                = "/health"
    matcher             = "200"
    interval            = 15
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 3
  }
}

# Traffic stays inside the VPC (Lambda ENI -> internal ALB). For end-to-end TLS add an
# ACM certificate + HTTPS listener with a private hosted zone name (see docs/iam-security.md).
resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.this.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type = "fixed-response"
    fixed_response {
      content_type = "application/json"
      message_body = "{\"message\":\"not found\"}"
      status_code  = "404"
    }
  }
}

resource "aws_lb_listener_rule" "graphql" {
  listener_arn = aws_lb_listener.http.arn
  priority     = 10

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.this.arn
  }
  condition {
    path_pattern { values = ["/graphql", "/health", "/ready"] }
  }
}

# ---------------- Service ----------------
resource "aws_ecs_service" "this" {
  name                               = "graphql-server"
  cluster                            = aws_ecs_cluster.this.id
  task_definition                    = aws_ecs_task_definition.this.arn
  desired_count                      = var.min_capacity
  deployment_minimum_healthy_percent = 100
  deployment_maximum_percent         = 200
  health_check_grace_period_seconds  = 60
  enable_ecs_managed_tags            = true
  propagate_tags                     = "SERVICE"
  wait_for_steady_state              = false

  # Cost: the first task always runs on regular Fargate (base=1); extra scaled-out tasks
  # prefer Fargate Spot (up to 70% cheaper). The app is stateless, so Spot interruptions are safe.
  capacity_provider_strategy {
    capacity_provider = "FARGATE"
    base              = 1
    weight            = 1
  }
  capacity_provider_strategy {
    capacity_provider = "FARGATE_SPOT"
    weight            = 3
  }

  network_configuration {
    subnets          = var.private_subnet_ids
    security_groups  = [var.service_security_group_id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.this.arn
    container_name   = local.container_name
    container_port   = local.container_port
  }

  # Automatic rollback: if new tasks fail health checks, ECS stops the deployment and
  # returns to the last working task definition by itself.
  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  lifecycle {
    ignore_changes = [task_definition, desired_count] # owned by CI/CD and auto scaling
  }

  depends_on = [aws_lb_listener_rule.graphql, aws_ecs_cluster_capacity_providers.this]
}

# ---------------- Auto Scaling ----------------
resource "aws_appautoscaling_target" "this" {
  service_namespace  = "ecs"
  resource_id        = "service/${aws_ecs_cluster.this.name}/${aws_ecs_service.this.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  min_capacity       = var.min_capacity
  max_capacity       = var.max_capacity
}

resource "aws_appautoscaling_policy" "cpu" {
  name               = "${var.name}-cpu-target"
  policy_type        = "TargetTrackingScaling"
  service_namespace  = aws_appautoscaling_target.this.service_namespace
  resource_id        = aws_appautoscaling_target.this.resource_id
  scalable_dimension = aws_appautoscaling_target.this.scalable_dimension

  target_tracking_scaling_policy_configuration {
    target_value       = 60
    scale_in_cooldown  = 300 # scale in slowly
    scale_out_cooldown = 60  # scale out fast
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
  }
}

resource "aws_appautoscaling_policy" "memory" {
  name               = "${var.name}-memory-target"
  policy_type        = "TargetTrackingScaling"
  service_namespace  = aws_appautoscaling_target.this.service_namespace
  resource_id        = aws_appautoscaling_target.this.resource_id
  scalable_dimension = aws_appautoscaling_target.this.scalable_dimension

  target_tracking_scaling_policy_configuration {
    target_value       = 75
    scale_in_cooldown  = 300
    scale_out_cooldown = 60
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageMemoryUtilization"
    }
  }
}

resource "aws_appautoscaling_policy" "requests" {
  name               = "${var.name}-requests-target"
  policy_type        = "TargetTrackingScaling"
  service_namespace  = aws_appautoscaling_target.this.service_namespace
  resource_id        = aws_appautoscaling_target.this.resource_id
  scalable_dimension = aws_appautoscaling_target.this.scalable_dimension

  target_tracking_scaling_policy_configuration {
    target_value       = 500 # requests per task per minute
    scale_in_cooldown  = 300
    scale_out_cooldown = 60
    predefined_metric_specification {
      predefined_metric_type = "ALBRequestCountPerTarget"
      resource_label         = "${aws_lb.this.arn_suffix}/${aws_lb_target_group.this.arn_suffix}"
    }
  }
}
