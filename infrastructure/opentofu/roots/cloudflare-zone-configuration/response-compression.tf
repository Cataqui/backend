resource "cloudflare_ruleset" "response_compression" {
  description = ""
  kind        = "zone"
  name        = "default"
  phase       = "http_response_compression"
  zone_id     = local.cataqui_zone_id

  rules = [{
    action = "compress_response"
    action_parameters = {
      algorithms = [
        { name = "zstd" },
        { name = "brotli" },
        { name = "gzip" },
        { name = "auto" },
      ]
    }
    description = " API compression priority"
    enabled     = true
    expression  = "(http.host contains \"api\")"
    ref         = "2962c2a81ba74c14b542530285a16ba4"
  }]

  lifecycle {
    prevent_destroy = true
  }
}
