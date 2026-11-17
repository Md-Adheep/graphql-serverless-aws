variable "name" {
  type = string
}

variable "aws_region" {
  type = string
}

variable "cidr_block" {
  type    = string
  default = "10.20.0.0/16"
}

variable "az_count" {
  type    = number
  default = 2
}

variable "single_nat_gateway" {
  description = "One shared NAT gateway (cheaper) vs one per AZ (highly available)"
  type        = bool
  default     = true
}
