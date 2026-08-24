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
  target = cloudflare_dns_record.framer_apex_primary
}

override_resource {
  target = cloudflare_dns_record.framer_apex_secondary
}

override_resource {
  target = cloudflare_dns_record.framer_www
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

run "owns_dnssec_and_exactly_eight_writable_records" {
  command = plan

  assert {
    condition = (
      length([
        cloudflare_dns_record.framer_apex_primary,
        cloudflare_dns_record.framer_apex_secondary,
        cloudflare_dns_record.framer_www,
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

run "preserves_live_website_routing" {
  command = plan

  assert {
    condition = (
      cloudflare_dns_record.framer_apex_primary.content == "31.43.160.6" &&
      cloudflare_dns_record.framer_apex_primary.proxied &&
      cloudflare_dns_record.framer_apex_primary.ttl == 1 &&
      cloudflare_dns_record.framer_apex_secondary.content == "31.43.161.6" &&
      cloudflare_dns_record.framer_apex_secondary.proxied &&
      cloudflare_dns_record.framer_apex_secondary.ttl == 1 &&
      cloudflare_dns_record.framer_www.name == "www.cataqui.com" &&
      cloudflare_dns_record.framer_www.type == "CNAME" &&
      cloudflare_dns_record.framer_www.content == "sites.framer.app" &&
      cloudflare_dns_record.framer_www.proxied &&
      cloudflare_dns_record.framer_www.ttl == 1
    )
    error_message = "The website records must preserve the live Framer routing."
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
