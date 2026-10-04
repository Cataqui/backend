resource "cloudflare_ruleset" "landing_redirect" {
  zone_id     = local.cataqui_zone_id
  name        = "Cataqui landing canonical domain"
  description = "Preserve paths and query strings when redirecting www to the landing apex."
  kind        = "zone"
  phase       = "http_request_dynamic_redirect"

  rules = [{
    action      = "redirect"
    description = "Redirect www.cataqui.com to cataqui.com"
    enabled     = true
    expression  = "http.host eq \"www.cataqui.com\""
    ref         = "landing_www_to_apex"
    action_parameters = {
      from_value = {
        status_code           = 301
        preserve_query_string = true
        target_url = {
          expression = "concat(\"https://cataqui.com\", http.request.uri.path)"
        }
      }
    }
  }]

  lifecycle {
    prevent_destroy = true
  }
}
