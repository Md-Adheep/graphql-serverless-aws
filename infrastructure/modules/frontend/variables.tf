variable "name" {
  type = string
}

variable "aws_region" {
  description = "Region of the AppSync API (used in the Content-Security-Policy connect-src)"
  type        = string
}

variable "domain_name" {
  description = "Optional custom domain (e.g. app.example.com). Empty = use the *.cloudfront.net URL."
  type        = string
  default     = ""
}

variable "force_destroy" {
  type    = bool
  default = false
}
