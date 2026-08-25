mock_provider "google" {
  mock_resource "google_project" {
    defaults = {
      number = "123456789012"
    }
  }
}

run "staging_project" {
  command = plan

  variables {
    environment    = "staging"
    enable_imports = false
  }

  assert {
    condition = (
      google_project.cataqui.name == "cataqui-staging" &&
      google_project.cataqui.project_id == "cataqui-staging" &&
      google_project.cataqui.org_id == "945579294313" &&
      google_project.cataqui.billing_account == "01A827-CA7CE9-646496"
    )
    error_message = "Staging must adopt the approved project under the Cataqui organization and billing account."
  }
}

run "production_project" {
  command = plan

  variables {
    environment    = "production"
    enable_imports = false
  }

  assert {
    condition = (
      google_project.cataqui.name == "cataqui-production" &&
      google_project.cataqui.project_id == "cataqui" &&
      google_project.cataqui.org_id == "945579294313" &&
      google_project.cataqui.billing_account == "01A827-CA7CE9-646496"
    )
    error_message = "Production must adopt the approved project under the Cataqui organization and billing account."
  }
}

run "project_safety" {
  command = plan

  variables {
    environment    = "production"
    enable_imports = false
  }

  assert {
    condition = (
      !google_project.cataqui.auto_create_network &&
      google_project.cataqui.deletion_policy == "PREVENT" &&
      google_project.cataqui.labels["environment"] == "production" &&
      google_project.cataqui.labels["managed-by"] == "opentofu" &&
      google_project.cataqui.labels["product"] == "cataqui"
    )
    error_message = "Projects must omit the default network, prevent deletion, and retain their ownership labels."
  }
}

run "project_outputs" {
  command = plan

  variables {
    environment    = "staging"
    enable_imports = false
  }

  assert {
    condition = (
      output.project_id == "cataqui-staging" &&
      output.project_number == "123456789012"
    )
    error_message = "The projects root must expose only its non-secret project identifiers."
  }
}

run "reject_unsupported_environment" {
  command = plan

  variables {
    environment    = "development"
    enable_imports = false
  }

  expect_failures = [var.environment]
}
