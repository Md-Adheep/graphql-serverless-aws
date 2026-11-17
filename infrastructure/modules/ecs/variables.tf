variable "name" {
  type = string
}

variable "aws_region" {
  type = string
}

variable "vpc_id" {
  type = string
}

variable "private_subnet_ids" {
  type = list(string)
}

variable "alb_security_group_id" {
  type = string
}

variable "service_security_group_id" {
  type = string
}

variable "db_proxy_endpoint" {
  type = string
}

variable "db_proxy_resource_id" {
  type = string
}

variable "db_name" {
  type = string
}

variable "db_username" {
  type = string
}

variable "internal_token_secret_arn" {
  type = string
}

variable "image_tag" {
  description = "Initial image tag for the baseline task definition (CI/CD deploys git-SHA tags afterwards)"
  type        = string
  default     = "bootstrap"
}

variable "cpu" {
  type    = number
  default = 256
}

variable "memory" {
  type    = number
  default = 512
}

variable "min_capacity" {
  type    = number
  default = 1
}

variable "max_capacity" {
  type    = number
  default = 4
}

variable "log_retention_days" {
  type    = number
  default = 30
}

variable "force_delete_ecr" {
  description = "Allow terraform destroy to delete the repository even if it contains images"
  type        = bool
  default     = false
}
