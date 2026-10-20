moved {
  from = cloudflare_api_token.worker_deployment["api"]
  to   = cloudflare_api_token.application_deployment["api"]
}

moved {
  from = cloudflare_api_token.worker_deployment["maps"]
  to   = cloudflare_api_token.application_deployment["maps"]
}

moved {
  from = infisical_secret.worker_deployment_cloudflare_api_token["api"]
  to   = infisical_secret.application_deployment_cloudflare_api_token["api"]
}

moved {
  from = infisical_secret.worker_deployment_cloudflare_api_token["maps"]
  to   = infisical_secret.application_deployment_cloudflare_api_token["maps"]
}
