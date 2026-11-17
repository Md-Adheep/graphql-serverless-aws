variable "aws_region" {
  type    = string
  default = "us-east-1"
}

variable "project" {
  type    = string
  default = "graphql-app"
}

variable "environment" {
  type    = string
  default = "prod"
}

variable "alert_email" {
  description = "Receives CloudWatch alarm emails. Passed from the GitHub secret ALERT_EMAIL."
  type        = string
  default     = ""
}

variable "domain_name" {
  description = "Optional custom domain for the frontend (needs DNS validation of the ACM cert)"
  type        = string
  default     = ""
}

# ----- Cost vs. resilience switches (defaults are cost-optimised for a demo) -----
variable "single_nat_gateway" {
  type    = bool
  default = true
}

variable "db_instance_class" {
  type    = string
  default = "db.t4g.micro"
}

variable "db_multi_az" {
  type    = bool
  default = false
}

variable "db_create_read_replica" {
  type    = bool
  default = false
}

variable "ecs_min_capacity" {
  type    = number
  default = 1
}

variable "ecs_max_capacity" {
  type    = number
  default = 4
}

variable "allow_destroy" {
  description = "true = easy teardown (no RDS deletion protection / final snapshot, force-delete buckets & ECR)"
  type        = bool
  default     = true
}
