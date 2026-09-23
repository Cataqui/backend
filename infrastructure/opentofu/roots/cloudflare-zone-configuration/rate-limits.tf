resource "cloudflare_ruleset" "rate_limits" {
  description = "High-volume emergency ceilings that protect Workers, Containers, Neon, and Redis without challenging users."
  kind        = "zone"
  name        = "Cataqui resource protection"
  phase       = "http_ratelimit"
  zone_id     = local.cataqui_zone_id

  rules = [
    {
      action = "block"
      action_parameters = {
        response = {
          content = jsonencode({
            errorCode         = "RATE_LIMITED"
            message           = "Too many requests. Please try again shortly."
            retryAfterSeconds = 60
            status            = 429
          })
          content_type = "application/json"
          status_code  = 429
        }
      }
      description = "Limit public contact detail scraping per environment and NAT-aware visitor"
      enabled     = true
      expression  = "http.host in {\"api.cataqui.com\" \"staging.api.cataqui.com\"} and http.request.method eq \"GET\" and starts_with(http.request.uri.path, \"/v1/contacts/\")"
      ratelimit = {
        characteristics     = ["cf.colo.id", "cf.unique_visitor_id"]
        mitigation_timeout  = 60
        period              = 60
        requests_per_period = 120
        requests_to_origin  = true
      }
      ref = "rate_limit_public_contact_lookup"
    },
    {
      action = "block"
      action_parameters = {
        response = {
          content = jsonencode({
            errorCode         = "RATE_LIMITED"
            message           = "Too many requests. Please try again shortly."
            retryAfterSeconds = 60
            status            = 429
          })
          content_type = "application/json"
          status_code  = 429
        }
      }
      description = "Limit NOTP intent creation per environment and NAT-aware visitor"
      enabled     = true
      expression  = "http.host in {\"api.cataqui.com\" \"staging.api.cataqui.com\"} and http.request.method eq \"POST\" and http.request.uri.path eq \"/v1/auth/notp/intents\""
      ratelimit = {
        characteristics     = ["cf.colo.id", "cf.unique_visitor_id"]
        mitigation_timeout  = 60
        period              = 60
        requests_per_period = 60
        requests_to_origin  = true
      }
      ref = "rate_limit_notp_intent_creation"
    },
    {
      action = "block"
      action_parameters = {
        response = {
          content = jsonencode({
            errorCode         = "RATE_LIMITED"
            message           = "Too many requests. Please try again shortly."
            retryAfterSeconds = 60
            status            = 429
          })
          content_type = "application/json"
          status_code  = 429
        }
      }
      description = "Retained disabled API health and root probe ceiling"
      enabled     = false
      expression  = "http.host in {\"api.cataqui.com\" \"staging.api.cataqui.com\"} and http.request.method in {\"GET\" \"HEAD\"} and (http.request.uri.path eq \"/\" or starts_with(http.request.uri.path, \"/v1/health\"))"
      ratelimit = {
        characteristics     = ["cf.colo.id", "ip.src"]
        mitigation_timeout  = 60
        period              = 60
        requests_per_period = 60
        requests_to_origin  = true
      }
      ref = "rate_limit_api_health_checks"
    },
    {
      action = "block"
      action_parameters = {
        response = {
          content = jsonencode({
            errorCode         = "RATE_LIMITED"
            message           = "Too many requests. Please try again shortly."
            retryAfterSeconds = 60
            status            = 429
          })
          content_type = "application/json"
          status_code  = 429
        }
      }
      description = "Limit repeated invalid WhatsApp webhook signatures"
      enabled     = true
      expression  = "http.host in {\"webhooks.cataqui.com\" \"staging.webhooks.cataqui.com\"} and http.request.method eq \"POST\" and http.request.uri.path eq \"/whatsapp\""
      ratelimit = {
        characteristics     = ["cf.colo.id", "ip.src"]
        counting_expression = "http.host in {\"webhooks.cataqui.com\" \"staging.webhooks.cataqui.com\"} and http.request.method eq \"POST\" and http.request.uri.path eq \"/whatsapp\" and http.response.code eq 401"
        mitigation_timeout  = 60
        period              = 60
        requests_per_period = 300
        requests_to_origin  = true
      }
      ref = "rate_limit_whatsapp_webhook_delivery"
    },
    {
      action = "block"
      action_parameters = {
        response = {
          content = jsonencode({
            errorCode         = "RATE_LIMITED"
            message           = "Too many requests. Please try again shortly."
            retryAfterSeconds = 60
            status            = 429
          })
          content_type = "application/json"
          status_code  = 429
        }
      }
      description = "Retained disabled total API traffic ceiling"
      enabled     = false
      expression  = "http.host in {\"api.cataqui.com\" \"staging.api.cataqui.com\"}"
      ratelimit = {
        characteristics     = ["cf.colo.id", "ip.src"]
        mitigation_timeout  = 60
        period              = 60
        requests_per_period = 1200
        requests_to_origin  = true
      }
      ref = "rate_limit_total_api_traffic"
    },
  ]

  lifecycle {
    prevent_destroy = true
  }
}

