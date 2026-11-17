# Terraform -> Serverless Framework / GitHub Actions hand-off.
# Non-secret identifiers only (ARNs, IDs, endpoints). Secrets stay in Secrets Manager;
# only their ARNs are published here.

locals {
  ssm_prefix = "/${var.project}/${var.environment}"

  ssm_params = {
    "lambda-sg-id"              = aws_security_group.lambda.id
    "db-proxy-endpoint"         = module.rds.proxy_endpoint
    "db-proxy-resource-id"      = module.rds.proxy_resource_id
    "db-name"                   = module.rds.db_name
    "db-username"               = module.rds.username
    "graphql-server-url"        = module.ecs.graphql_url
    "internal-token-secret-arn" = module.secrets.internal_token_secret_arn
    "alarm-topic-arn"           = module.monitoring.alarm_topic_arn
    "ecs-cluster"               = module.ecs.cluster_name
    "ecs-service"               = module.ecs.service_name
    "ecs-task-family"           = module.ecs.task_family
    "ecs-container-name"        = module.ecs.container_name
    "ecr-repository-url"        = module.ecs.ecr_repository_url
    "frontend-bucket"           = module.frontend.bucket_name
    "frontend-artifacts-bucket" = module.frontend.artifacts_bucket_name
    "frontend-distribution-id"  = module.frontend.distribution_id
    "frontend-url"              = module.frontend.url
  }
}

resource "aws_ssm_parameter" "this" {
  for_each = local.ssm_params
  name     = "${local.ssm_prefix}/${each.key}"
  type     = "String"
  value    = each.value
}

resource "aws_ssm_parameter" "private_subnet_ids" {
  name  = "${local.ssm_prefix}/private-subnet-ids"
  type  = "StringList"
  value = join(",", module.vpc.private_subnet_ids)
}
