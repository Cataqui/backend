mock_provider "cloudflare" {}

variables {
  enable_imports = false
}

override_data {
  target = data.cloudflare_zone.cataqui
  values = {
    account = {
      id   = "1fca946385505503c59dd6a2a4eeb442"
      name = "Ventairy"
    }
    id     = "0c75bfd5c20cdbb338d44e62bcde8acc"
    name   = "cataqui.com"
    status = "active"
  }
}

override_resource {
  target = cloudflare_zone_dnssec.cataqui
}

override_resource {
  target = cloudflare_dns_record.landing_apex
}

override_resource {
  target = cloudflare_dns_record.landing_www
}

override_resource {
  target = cloudflare_dns_record.google_site_verification_primary
}

override_resource {
  target = cloudflare_dns_record.google_site_verification_secondary
}

override_resource {
  target = cloudflare_dns_record.cloudflare_email_routing_spf
}

override_resource {
  target = cloudflare_dns_record.cloudflare_dmarc_reporting
}

override_resource {
  target = cloudflare_dns_record.github_organization_verification
}

override_data {
  target = data.terraform_remote_state.pages_staging
  values = { outputs = { subdomain = "cataqui-landing-staging.pages.dev", domains = ["staging.cataqui.com"] } }
}

override_data {
  target = data.terraform_remote_state.pages_production
  values = { outputs = { subdomain = "production-actual-host.pages.dev", domains = ["cataqui.com", "www.cataqui.com"] } }
}

run "owns_dnssec_and_exactly_eight_writable_records" {
  command = plan

  assert {
    condition = (
      length([
        cloudflare_dns_record.landing_apex,
        cloudflare_dns_record.landing_staging,
        cloudflare_dns_record.landing_www,
        cloudflare_dns_record.google_site_verification_primary,
        cloudflare_dns_record.google_site_verification_secondary,
        cloudflare_dns_record.cloudflare_email_routing_spf,
        cloudflare_dns_record.cloudflare_dmarc_reporting,
        cloudflare_dns_record.github_organization_verification,
      ]) == 8 &&
      cloudflare_zone_dnssec.cataqui.status == "active"
    )
    error_message = "The DNS root must own DNSSEC and exactly eight writable records."
  }
}

run "preserves_verification_and_email_policy_records" {
  command = plan

  assert {
    condition = toset([
      cloudflare_dns_record.google_site_verification_primary.content,
      cloudflare_dns_record.google_site_verification_secondary.content,
      cloudflare_dns_record.cloudflare_email_routing_spf.content,
      cloudflare_dns_record.cloudflare_dmarc_reporting.content,
      cloudflare_dns_record.github_organization_verification.content,
      ]) == toset([
      "\"google-site-verification=EjwE_V-gLua0A8MzdWCMC4vDetwjO6rmcS-E-FwgCNk\"",
      "\"google-site-verification=C3jugGoCoqhEWKGFrEBfCp3XiJCBAuLYFEBJcUj_6As\"",
      "\"v=spf1 include:_spf.mx.cloudflare.net ~all\"",
      "\"v=DMARC1; p=none; rua=mailto:19e02ba7770f400aaa8fb9fef52c8da0@dmarc-reports.cloudflare.net\"",
      "\"cc41db8631\"",
    ])
    error_message = "The writable verification, SPF, and DMARC values must match the retained live set."
  }

  assert {
    condition = alltrue([
      !cloudflare_dns_record.google_site_verification_primary.proxied,
      !cloudflare_dns_record.google_site_verification_secondary.proxied,
      !cloudflare_dns_record.cloudflare_email_routing_spf.proxied,
      !cloudflare_dns_record.cloudflare_dmarc_reporting.proxied,
      !cloudflare_dns_record.github_organization_verification.proxied,
    ])
    error_message = "Verification and email-policy TXT records must remain unproxied."
  }
}

run "route_registered_pages_domains" {
  command = plan
  assert {
    condition = (
      cloudflare_dns_record.landing_apex.type == "CNAME" &&
      cloudflare_dns_record.landing_apex.content == "production-actual-host.pages.dev" &&
      cloudflare_dns_record.landing_www.content == "production-actual-host.pages.dev" &&
      cloudflare_dns_record.landing_staging.content == "cataqui-landing-staging.pages.dev" &&
      cloudflare_dns_record.landing_staging.proxied
    )
    error_message = "Each domain must use its own registered Pages project's actual hostname."
  }
}

run "reject_unregistered_staging_domain" {
  command = plan
  override_data {
    target = data.terraform_remote_state.pages_staging
    values = { outputs = { subdomain = "cataqui-landing-staging.pages.dev", domains = [] } }
  }
  expect_failures = [cloudflare_dns_record.landing_staging]
}
