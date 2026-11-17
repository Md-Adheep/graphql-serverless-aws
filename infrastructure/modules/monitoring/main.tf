# CloudWatch alarms for the Terraform-managed tier (ECS, ALB, RDS, RDS Proxy) + one dashboard
# for the whole system. Lambda & AppSync alarms live next to the functions in serverless.yml.
# Every alarm notifies the same SNS topic (email by default; plug in Slack/PagerDuty later).

resource "aws_sns_topic" "alarms" {
  name = "${var.name}-alarms"
}

resource "aws_sns_topic_subscription" "email" {
  count     = var.alert_email == "" ? 0 : 1
  topic_arn = aws_sns_topic.alarms.arn
  protocol  = "email"
  endpoint  = var.alert_email # recipient must click the confirmation link once
}

locals {
  actions = [aws_sns_topic.alarms.arn]

  alarms = {
    # ---------------- ECS Fargate ----------------
    ecs-cpu-high = {
      description = "GraphQL server CPU > 80% (autoscaling should be adding tasks)"
      namespace   = "AWS/ECS", metric = "CPUUtilization", stat = "Average"
      dimensions  = { ClusterName = var.ecs_cluster_name, ServiceName = var.ecs_service_name }
      threshold   = 80, operator = "GreaterThanThreshold", periods = 3, missing = "notBreaching"
    }
    ecs-memory-high = {
      description = "GraphQL server memory > 85%"
      namespace   = "AWS/ECS", metric = "MemoryUtilization", stat = "Average"
      dimensions  = { ClusterName = var.ecs_cluster_name, ServiceName = var.ecs_service_name }
      threshold   = 85, operator = "GreaterThanThreshold", periods = 3, missing = "notBreaching"
    }
    ecs-no-running-tasks = {
      description = "GraphQL server has no running tasks - writes are down"
      namespace   = "ECS/ContainerInsights", metric = "RunningTaskCount", stat = "Average"
      dimensions  = { ClusterName = var.ecs_cluster_name, ServiceName = var.ecs_service_name }
      threshold   = 1, operator = "LessThanThreshold", periods = 2, missing = "breaching"
    }
    # ---------------- Internal ALB ----------------
    alb-target-5xx = {
      description = "GraphQL server returning 5xx"
      namespace   = "AWS/ApplicationELB", metric = "HTTPCode_Target_5XX_Count", stat = "Sum"
      dimensions  = { LoadBalancer = var.alb_arn_suffix }
      threshold   = 5, operator = "GreaterThanOrEqualToThreshold", periods = 1, missing = "notBreaching"
    }
    alb-unhealthy-targets = {
      description = "One or more GraphQL server tasks failing health checks"
      namespace   = "AWS/ApplicationELB", metric = "UnHealthyHostCount", stat = "Maximum"
      dimensions  = { LoadBalancer = var.alb_arn_suffix, TargetGroup = var.target_group_arn_suffix }
      threshold   = 0, operator = "GreaterThanThreshold", periods = 2, missing = "notBreaching"
    }
    # ---------------- RDS ----------------
    rds-cpu-high = {
      description = "RDS CPU > 80% - consider a larger instance class or a read replica"
      namespace   = "AWS/RDS", metric = "CPUUtilization", stat = "Average"
      dimensions  = { DBInstanceIdentifier = var.db_instance_identifier }
      threshold   = 80, operator = "GreaterThanThreshold", periods = 3, missing = "notBreaching"
    }
    rds-connections-high = {
      description = "RDS connection count high - check RDS Proxy pooling / runaway clients"
      namespace   = "AWS/RDS", metric = "DatabaseConnections", stat = "Maximum"
      dimensions  = { DBInstanceIdentifier = var.db_instance_identifier }
      threshold   = var.db_connections_threshold, operator = "GreaterThanThreshold", periods = 2, missing = "notBreaching"
    }
    rds-free-storage-low = {
      description = "RDS free storage < 2 GiB (storage autoscaling should kick in)"
      namespace   = "AWS/RDS", metric = "FreeStorageSpace", stat = "Minimum"
      dimensions  = { DBInstanceIdentifier = var.db_instance_identifier }
      threshold   = 2147483648, operator = "LessThanThreshold", periods = 1, missing = "notBreaching"
    }
    rds-freeable-memory-low = {
      description = "RDS freeable memory < 64 MiB"
      namespace   = "AWS/RDS", metric = "FreeableMemory", stat = "Minimum"
      dimensions  = { DBInstanceIdentifier = var.db_instance_identifier }
      threshold   = 67108864, operator = "LessThanThreshold", periods = 3, missing = "notBreaching"
    }
    # ---------------- RDS Proxy ----------------
    rds-proxy-client-connections-high = {
      description = "Many client connections on RDS Proxy (Lambda concurrency spike?)"
      namespace   = "AWS/RDS", metric = "ClientConnections", stat = "Maximum"
      dimensions  = { ProxyName = var.db_proxy_name }
      threshold   = 500, operator = "GreaterThanThreshold", periods = 2, missing = "notBreaching"
    }
  }
}

resource "aws_cloudwatch_metric_alarm" "this" {
  for_each = local.alarms

  alarm_name          = "${var.name}-${each.key}"
  alarm_description   = each.value.description
  namespace           = each.value.namespace
  metric_name         = each.value.metric
  statistic           = each.value.stat
  dimensions          = each.value.dimensions
  period              = 60
  evaluation_periods  = each.value.periods
  threshold           = each.value.threshold
  comparison_operator = each.value.operator
  treat_missing_data  = each.value.missing
  alarm_actions       = local.actions
  ok_actions          = local.actions
}

resource "aws_cloudwatch_metric_alarm" "alb_latency_p95" {
  alarm_name          = "${var.name}-alb-latency-p95"
  alarm_description   = "GraphQL server p95 response time > 1s"
  namespace           = "AWS/ApplicationELB"
  metric_name         = "TargetResponseTime"
  extended_statistic  = "p95"
  dimensions          = { LoadBalancer = var.alb_arn_suffix }
  period              = 60
  evaluation_periods  = 5
  datapoints_to_alarm = 3
  threshold           = 1
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.actions
  ok_actions          = local.actions
}

# ---------------- Dashboard ----------------
locals {
  lambda_fns = [for f in ["queries", "mutations", "subscriptions"] : "${var.lambda_function_prefix}-${f}"]
}

resource "aws_cloudwatch_dashboard" "this" {
  dashboard_name = var.name
  dashboard_body = jsonencode({
    widgets = [
      {
        type = "metric", x = 0, y = 0, width = 8, height = 6
        properties = {
          title   = "Lambda invocations", region = var.aws_region, stat = "Sum", period = 60
          metrics = [for f in local.lambda_fns : ["AWS/Lambda", "Invocations", "FunctionName", f]]
        }
      },
      {
        type = "metric", x = 8, y = 0, width = 8, height = 6
        properties = {
          title   = "Lambda errors", region = var.aws_region, stat = "Sum", period = 60
          metrics = [for f in local.lambda_fns : ["AWS/Lambda", "Errors", "FunctionName", f]]
        }
      },
      {
        type = "metric", x = 16, y = 0, width = 8, height = 6
        properties = {
          title   = "Lambda duration p95 (ms)", region = var.aws_region, stat = "p95", period = 60
          metrics = [for f in local.lambda_fns : ["AWS/Lambda", "Duration", "FunctionName", f]]
        }
      },
      {
        type = "metric", x = 0, y = 6, width = 8, height = 6
        properties = {
          title = "ECS CPU / memory (%)", region = var.aws_region, stat = "Average", period = 60
          metrics = [
            ["AWS/ECS", "CPUUtilization", "ClusterName", var.ecs_cluster_name, "ServiceName", var.ecs_service_name],
            ["AWS/ECS", "MemoryUtilization", "ClusterName", var.ecs_cluster_name, "ServiceName", var.ecs_service_name],
          ]
        }
      },
      {
        type = "metric", x = 8, y = 6, width = 8, height = 6
        properties = {
          title   = "ECS running tasks", region = var.aws_region, stat = "Average", period = 60
          metrics = [["ECS/ContainerInsights", "RunningTaskCount", "ClusterName", var.ecs_cluster_name, "ServiceName", var.ecs_service_name]]
        }
      },
      {
        type = "metric", x = 16, y = 6, width = 8, height = 6
        properties = {
          title = "Internal ALB requests / 5xx", region = var.aws_region, stat = "Sum", period = 60
          metrics = [
            ["AWS/ApplicationELB", "RequestCount", "LoadBalancer", var.alb_arn_suffix],
            ["AWS/ApplicationELB", "HTTPCode_Target_5XX_Count", "LoadBalancer", var.alb_arn_suffix],
          ]
        }
      },
      {
        type = "metric", x = 0, y = 12, width = 8, height = 6
        properties = {
          title   = "RDS CPU (%)", region = var.aws_region, stat = "Average", period = 60
          metrics = [["AWS/RDS", "CPUUtilization", "DBInstanceIdentifier", var.db_instance_identifier]]
        }
      },
      {
        type = "metric", x = 8, y = 12, width = 8, height = 6
        properties = {
          title = "DB connections (instance vs proxy clients)", region = var.aws_region, stat = "Maximum", period = 60
          metrics = [
            ["AWS/RDS", "DatabaseConnections", "DBInstanceIdentifier", var.db_instance_identifier],
            ["AWS/RDS", "ClientConnections", "ProxyName", var.db_proxy_name],
          ]
        }
      },
      {
        type = "metric", x = 16, y = 12, width = 8, height = 6
        properties = {
          title   = "RDS free storage (bytes)", region = var.aws_region, stat = "Minimum", period = 300
          metrics = [["AWS/RDS", "FreeStorageSpace", "DBInstanceIdentifier", var.db_instance_identifier]]
        }
      },
    ]
  })
}
