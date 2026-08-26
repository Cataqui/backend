variable "github_oidc_subject_prefix" {
  description = "Immutable GitHub OIDC subject prefix discovered from the repository API."
  type        = string

  validation {
    condition     = can(regex("^repo:[A-Za-z0-9_.-]+@[1-9][0-9]*/[A-Za-z0-9_.-]+@[1-9][0-9]*$", var.github_oidc_subject_prefix))
    error_message = "github_oidc_subject_prefix must use GitHub's immutable repo:OWNER@ID/REPOSITORY@ID form."
  }
}

check "github_oidc_repository" {
  assert {
    condition = can(regex(
      "^repo:${replace(local.github_repository, "/", "@[1-9][0-9]*/")}@[1-9][0-9]*$",
      var.github_oidc_subject_prefix,
    ))
    error_message = "github_oidc_subject_prefix must identify the configured GitHub repository."
  }
}
