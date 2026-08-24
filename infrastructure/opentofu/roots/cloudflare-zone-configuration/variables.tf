variable "enable_imports" {
  description = "Whether declarative imports are active. Disable only in credential-free mocked tests."
  type        = bool
  default     = true
}
