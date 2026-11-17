variable "aws_region" {
  description = "Primary AWS region"
  type        = string
  default     = "us-east-1"
}

variable "project" {
  description = "Project name prefix. All IAM roles the deploy role may manage start with this."
  type        = string
  default     = "graphql-app"
}

variable "github_repository" {
  description = "GitHub repository allowed to deploy, as owner/name"
  type        = string
  default     = "Md-Adheep/graphql-serverless-aws"
}
