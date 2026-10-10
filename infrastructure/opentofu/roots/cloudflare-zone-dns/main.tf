resource "cloudflare_dns_record" "landing_apex" {
  zone_id = local.cataqui_zone_id
  name    = "cataqui.com"
  type    = "CNAME"
  content = data.terraform_remote_state.pages_production.outputs.subdomain
  proxied = true
  ttl     = 1

  lifecycle {
    prevent_destroy = true
    precondition {
      condition = contains(
        data.terraform_remote_state.pages_production.outputs.domains, "cataqui.com"
      )
      error_message = "Register the production domains in Pages before changing DNS."
    }
  }
}

resource "cloudflare_dns_record" "landing_www" {
  zone_id = local.cataqui_zone_id
  name    = "www.cataqui.com"
  type    = "CNAME"
  content = data.terraform_remote_state.pages_production.outputs.subdomain
  proxied = true
  ttl     = 1

  lifecycle {
    prevent_destroy = true
    precondition {
      condition = contains(
        data.terraform_remote_state.pages_production.outputs.domains, "www.cataqui.com"
      )
      error_message = "Register the production domains in Pages before changing DNS."
    }
  }
}

resource "cloudflare_dns_record" "landing_staging" {
  zone_id = local.cataqui_zone_id
  name    = "staging.cataqui.com"
  type    = "CNAME"
  content = data.terraform_remote_state.pages_staging.outputs.subdomain
  proxied = true
  ttl     = 1

  lifecycle {
    prevent_destroy = true
    precondition {
      condition     = contains(data.terraform_remote_state.pages_staging.outputs.domains, "staging.cataqui.com")
      error_message = "Register the staging domain in its Pages project before changing DNS."
    }
  }
}

resource "cloudflare_dns_record" "google_site_verification_primary" {
  zone_id = local.cataqui_zone_id
  name    = "cataqui.com"
  type    = "TXT"
  content = "\"google-site-verification=EjwE_V-gLua0A8MzdWCMC4vDetwjO6rmcS-E-FwgCNk\""
  proxied = false
  ttl     = 3600

  lifecycle {
    prevent_destroy = true
  }
}

resource "cloudflare_dns_record" "google_site_verification_secondary" {
  zone_id = local.cataqui_zone_id
  name    = "cataqui.com"
  type    = "TXT"
  content = "\"google-site-verification=C3jugGoCoqhEWKGFrEBfCp3XiJCBAuLYFEBJcUj_6As\""
  proxied = false
  ttl     = 3600

  lifecycle {
    prevent_destroy = true
  }
}

resource "cloudflare_dns_record" "cloudflare_email_routing_spf" {
  zone_id = local.cataqui_zone_id
  name    = "cataqui.com"
  type    = "TXT"
  content = "\"v=spf1 include:_spf.mx.cloudflare.net ~all\""
  proxied = false
  ttl     = 1

  lifecycle {
    prevent_destroy = true
  }
}

resource "cloudflare_dns_record" "cloudflare_dmarc_reporting" {
  zone_id = local.cataqui_zone_id
  name    = "_dmarc.cataqui.com"
  type    = "TXT"
  content = "\"v=DMARC1; p=none; rua=mailto:19e02ba7770f400aaa8fb9fef52c8da0@dmarc-reports.cloudflare.net\""
  proxied = false
  ttl     = 1

  lifecycle {
    prevent_destroy = true
  }
}

resource "cloudflare_dns_record" "github_organization_verification" {
  zone_id = local.cataqui_zone_id
  name    = "_gh-cataqui-o.cataqui.com"
  type    = "TXT"
  content = "\"cc41db8631\""
  proxied = false
  ttl     = 1

  lifecycle {
    prevent_destroy = true
  }
}
resource "cloudflare_zone_dnssec" "cataqui" {
  status  = "active"
  zone_id = local.cataqui_zone_id

  lifecycle {
    prevent_destroy = true
  }
}
