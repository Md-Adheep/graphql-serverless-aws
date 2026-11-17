variable "aws_region" {
  description = "Primary AWS region"
  type        = string
  default     = "us-east-2"
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

variable "create_github_oidc_provider" {
  description = "false = reuse the GitHub OIDC provider that already exists in this AWS account"
  type        = bool
  default     = true
}

# Numeric IDs used by GitHub's "immutable subject" OIDC claim format.
#   gh api repos/<owner>/<repo> --jq '{repo_id: .id, owner_id: .owner.id}'
variable "github_owner_id" {
  description = "Numeric GitHub user/org ID of the repository owner"
  type        = string
  default     = "232045433"
}

variable "github_repository_id" {
  description = "Numeric GitHub repository ID"
  type        = string
  default     = "1461322559"
}
