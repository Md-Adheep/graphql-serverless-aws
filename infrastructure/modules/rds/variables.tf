variable "name" {
  type = string
}

variable "database_subnet_ids" {
  type = list(string)
}

variable "security_group_id" {
  description = "SG attached to the DB instance"
  type        = string
}

variable "proxy_security_group_id" {
  description = "SG attached to RDS Proxy"
  type        = string
}

variable "engine_version" {
  type    = string
  default = "16"
}

variable "instance_class" {
  description = "db.t4g.micro is free-tier eligible; scale vertically (e.g. db.t4g.medium / db.m7g.large) as load grows"
  type        = string
  default     = "db.t4g.micro"
}

variable "db_name" {
  type    = string
  default = "appdb"
}

variable "username" {
  type    = string
  default = "app_admin"
}

variable "allocated_storage" {
  type    = number
  default = 20
}

variable "max_allocated_storage" {
  description = "Upper bound for storage autoscaling (GiB)"
  type        = number
  default     = 100
}

variable "multi_az" {
  type    = bool
  default = false
}

variable "create_read_replica" {
  type    = bool
  default = false
}

variable "backup_retention_days" {
  type    = number
  default = 7
}

variable "enhanced_monitoring_interval" {
  description = "Seconds between OS-level metrics (0 disables)"
  type        = number
  default     = 60
}

variable "deletion_protection" {
  type    = bool
  default = true
}

variable "skip_final_snapshot" {
  type    = bool
  default = false
}

variable "apply_immediately" {
  type    = bool
  default = false
}
