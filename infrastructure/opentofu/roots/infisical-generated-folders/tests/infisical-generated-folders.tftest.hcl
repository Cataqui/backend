mock_provider "infisical" {}

run "generated_folder_contract" {
  command = plan

  variables {
    environment = "staging"
  }

  assert {
    condition = (
      infisical_secret_folder.generated.folder_path == "/" &&
      infisical_secret_folder.generated.name == "generated" &&
      !infisical_secret_folder.generated.force_delete
    )
    error_message = "The generated folder must be a protected top-level folder."
  }

  assert {
    condition = (
      infisical_secret_folder.runtime.folder_path == "/generated" &&
      infisical_secret_folder.runtime.name == "runtime" &&
      !infisical_secret_folder.runtime.force_delete &&
      infisical_secret_folder.deployment.folder_path == "/generated" &&
      infisical_secret_folder.deployment.name == "deployment" &&
      !infisical_secret_folder.deployment.force_delete
    )
    error_message = "Runtime and deployment folders must be protected children of generated."
  }
}

run "production_folder_environment" {
  command = plan

  variables {
    environment = "production"
  }

  assert {
    condition = (
      infisical_secret_folder.generated.environment_slug == "production" &&
      infisical_secret_folder.runtime.environment_slug == "production" &&
      infisical_secret_folder.deployment.environment_slug == "production"
    )
    error_message = "Every folder must use the selected Infisical environment."
  }
}

run "reject_unsupported_environment" {
  command = plan

  variables {
    environment = "development"
  }

  expect_failures = [var.environment]
}
