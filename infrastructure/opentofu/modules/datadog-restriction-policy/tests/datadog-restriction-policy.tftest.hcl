mock_provider "datadog" {}

variables {
  editor_principals = ["role:00000000-0000-4000-8000-000000000000"]
  resource_id       = "monitor:123456"
  viewer_principals = ["org:00000000-0000-4000-8000-000000000001"]
}

run "valid_typed_bindings_are_preserved" {
  command = plan

  assert {
    condition = (
      datadog_restriction_policy.this.resource_id == "monitor:123456" &&
      output.bindings.editors == toset(["role:00000000-0000-4000-8000-000000000000"]) &&
      output.bindings.viewers == toset(["org:00000000-0000-4000-8000-000000000001"])
    )
    error_message = "The restriction-policy module must preserve the exact typed resource and principal bindings."
  }
}

run "unsupported_resource_types_are_rejected" {
  command = plan

  variables {
    resource_id = "dashboard:123456"
  }

  expect_failures = [var.resource_id]
}

run "malformed_viewer_principals_are_rejected" {
  command = plan

  variables {
    viewer_principals = ["org:current"]
  }

  expect_failures = [var.viewer_principals]
}

run "empty_editor_principals_are_rejected" {
  command = plan

  variables {
    editor_principals = []
  }

  expect_failures = [var.editor_principals]
}
