resource "cloudflare_bot_management" "cataqui" {
  ai_bots_protection              = "block"
  content_bots_protection         = "disabled"
  crawler_protection              = "enabled"
  enable_js                       = false
  is_robots_txt_managed           = false
  optimize_wordpress              = false
  sbfm_definitely_automated       = "block"
  sbfm_likely_automated           = "managed_challenge"
  sbfm_static_resource_protection = false
  sbfm_verified_bots              = "allow"
  suppress_session_score          = false
  zone_id                         = local.cataqui_zone_id

  lifecycle {
    prevent_destroy = true
  }
}
