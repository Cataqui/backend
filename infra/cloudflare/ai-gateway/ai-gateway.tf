module "application" {
  source = "../modules/ai-gateway"

  cloudflare_account_id = var.cloudflare_account_id
  configuration         = local.gateway_configuration
  configuration_shape = {
    top_level    = toset(keys(local.gateway_configuration))
    spend_limits = toset(keys(local.gateway_configuration.spend_limits))
    spend_limit_rules = [
      for rule in local.gateway_configuration.spend_limits.rules : toset(keys(rule))
    ]
  }
  gateway_id = var.environment
}
