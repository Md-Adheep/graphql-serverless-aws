variable "name" {
  type = string
}

variable "recovery_window_in_days" {
  description = "0 = delete immediately on destroy (handy for a demo); use 7-30 in production"
  type        = number
  default     = 7
}
