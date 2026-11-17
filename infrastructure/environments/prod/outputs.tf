output "frontend_url" {
  value = module.frontend.url
}

output "cloudfront_distribution_id" {
  value = module.frontend.distribution_id
}

output "acm_validation_records" {
  value = module.frontend.acm_validation_records
}

output "ecr_repository_url" {
  value = module.ecs.ecr_repository_url
}

output "graphql_server_internal_url" {
  value = module.ecs.graphql_url
}

output "rds_proxy_endpoint" {
  value = module.rds.proxy_endpoint
}

output "alarm_topic_arn" {
  value = module.monitoring.alarm_topic_arn
}

output "dashboard_url" {
  value = "https://${var.aws_region}.console.aws.amazon.com/cloudwatch/home?region=${var.aws_region}#dashboards/dashboard/${module.monitoring.dashboard_name}"
}
