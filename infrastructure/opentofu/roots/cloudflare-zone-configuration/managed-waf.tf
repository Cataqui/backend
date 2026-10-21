resource "cloudflare_ruleset" "managed_waf" {
  description = "Cloudflare managed protection for Cataqui websites and APIs."
  kind        = "zone"
  name        = "Cataqui managed WAF"
  phase       = "http_request_firewall_managed"
  zone_id     = local.cataqui_zone_id

  rules = [{
    action = "execute"
    action_parameters = {
      id = "efb7b8c949ac4650a09736fc376e9aee"
    }
    description = "Execute Cloudflare Managed Ruleset except for the WhatsApp route authenticated by Worker HMAC"
    enabled     = true
    expression  = "not (http.host in {\"auth.cataqui.com\" \"staging.auth.cataqui.com\"} and http.request.method eq \"POST\" and http.request.uri.path eq \"/webhooks/whatsapp\")"
    ref         = "execute_cloudflare_managed_ruleset"
  }]

  lifecycle {
    prevent_destroy = true
  }
}

