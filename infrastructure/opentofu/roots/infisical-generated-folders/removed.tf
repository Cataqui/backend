# The Auth folders start fresh. Forget the old folder ownership without deleting
# externally issued Meta credentials still stored there for the manual copy.
removed {
  from = infisical_secret_folder.webhooks
  lifecycle {
    destroy = false
  }
}
removed {
  from = infisical_secret_folder.webhooks_runtime
  lifecycle {
    destroy = false
  }
}
removed {
  from = infisical_secret_folder.webhooks_deployment
  lifecycle {
    destroy = false
  }
}
