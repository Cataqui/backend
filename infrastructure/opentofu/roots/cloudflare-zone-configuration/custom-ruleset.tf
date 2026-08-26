resource "cloudflare_ruleset" "custom" {
  description = ""
  kind        = "zone"
  name        = "default"
  phase       = "http_request_firewall_custom"
  zone_id     = local.cataqui_zone_id

  rules = [
    {
      action      = "block"
      description = "Restrict HTTP methods"
      enabled     = true
      expression  = "(http.host in {\"api.cataqui.com\" \"staging.api.cataqui.com\"} and not http.request.method in {\"GET\" \"POST\" \"PUT\" \"PATCH\" \"OPTIONS\" \"DELETE\" \"HEAD\" \"QUERY\"})"
      ref         = "d3e8252afe7746e7b3d2beeef2bf7c4b"
    },
    {
      action      = "block"
      description = "Block API writes with non-JSON bodies"
      enabled     = true
      expression  = "(http.host in {\"api.cataqui.com\" \"staging.api.cataqui.com\"} and http.request.method in {\"POST\" \"PUT\" \"PATCH\"} and not any(http.request.headers[\"content-type\"][*] wildcard \"*application/json*\") and not (http.request.method eq \"POST\" and http.request.uri.path matches \"^/v1/jobs/[^/]+/publish$\"))"
      ref         = "cc18571df63646d482095c03e1774138"
    },
    {
      action      = "block"
      description = "Block malformed WhatsApp deliveries before Worker body processing"
      enabled     = true
      expression  = "(http.host in {\"webhooks.cataqui.com\" \"staging.webhooks.cataqui.com\"} and http.request.method eq \"POST\" and http.request.uri.path eq \"/whatsapp\" and (not any(http.request.headers[\"content-type\"][*] wildcard \"*application/json*\") or not any(http.request.headers[\"x-hub-signature-256\"][*] matches \"^sha256=[0-9a-fA-F]{64}$\")))"
      ref         = "block_malformed_whatsapp_delivery"
    },
    {
      action      = "block"
      description = "Block internal and production documentation routes before Workers"
      enabled     = true
      expression  = "(http.host in {\"api.cataqui.com\" \"staging.api.cataqui.com\"} and starts_with(lower(http.request.uri.path), \"/internal\")) or (http.host eq \"api.cataqui.com\" and starts_with(lower(http.request.uri.path), \"/docs\"))"
      ref         = "block_private_api_routes"
    },
    {
      action      = "block"
      description = "Block Common Reconnaissance Paths"
      enabled     = true
      expression = trimspace(<<-EOT
        starts_with(http.request.uri.path, "/.env") or
        starts_with(http.request.uri.path, "/.git") or
        starts_with(http.request.uri.path, "/.svn") or
        starts_with(http.request.uri.path, "/.hg") or
        starts_with(http.request.uri.path, "/.DS_Store") or
        starts_with(http.request.uri.path, "/phpmyadmin") or
        starts_with(http.request.uri.path, "/pma") or
        starts_with(http.request.uri.path, "/wp-admin") or
        starts_with(http.request.uri.path, "/wp-login.php") or
        starts_with(http.request.uri.path, "/xmlrpc.php") or
        starts_with(http.request.uri.path, "/vendor") or
        starts_with(http.request.uri.path, "/cgi-bin")
      EOT
      )
      ref = "44a35aef2c7e4a5a9f6b12bf742166bb"
    },
    {
      action      = "block"
      description = "Block obvious scanner user agents"
      enabled     = true
      expression  = "(http.user_agent contains \"sqlmap\") or (http.user_agent contains \"nikto\") or (http.user_agent contains \"masscan\") or (http.user_agent contains \"nmap\") or (http.user_agent contains \"dirbuster\")"
      ref         = "04a6654bc52f42cabb0daf37726012ee"
    },
    {
      action = "skip"
      action_parameters = {
        ruleset = "current"
      }
      description = "Skip rules for verified bots"
      enabled     = true
      expression  = "(cf.client.bot)"
      logging = {
        enabled = true
      }
      ref = "3fd61308042e43c18464f8e943a60763"
    },
    {
      action = "skip"
      action_parameters = {
        phases   = ["http_request_sbfm"]
        products = ["bic"]
      }
      description = "Keep APIs and webhooks free of browser-only checks"
      enabled     = true
      expression  = "http.host in {\"api.cataqui.com\" \"staging.api.cataqui.com\" \"geosearch.cataqui.com\" \"staging.geosearch.cataqui.com\" \"webhooks.cataqui.com\" \"staging.webhooks.cataqui.com\"}"
      logging = {
        enabled = true
      }
      ref = "skip_sbfm_for_non_browser_traffic"
    },
  ]

  lifecycle {
    prevent_destroy = true
  }
}
