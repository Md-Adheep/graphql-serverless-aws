variable "name" {
  type = string
}

variable "aws_region" {
  type = string
}

variable "alert_email" {
  description = "Email that receives alarm notifications (empty = no subscription)"
  type        = string
  default     = ""
}

variable "ecs_cluster_name" {
  type = string
}

variable "ecs_service_name" {
  type = string
}

variable "alb_arn_suffix" {
  type = string
}

variable "target_group_arn_suffix" {
  type = string
}

variable "db_instance_identifier" {
  type = string
}

variable "db_proxy_name" {
  type = string
}

variable "db_connections_threshold" {
  description = "db.t4g.micro allows ~80 connections; alarm well before that"
  type        = number
  default     = 60
}

variable "lambda_function_prefix" {
  description = "Serverless function name prefix, e.g. graphql-app-lambdas-prod"
  type        = string
}
