# These old paths stay untouched; Auth receives newly generated secrets. The
# obsolete API/Webhooks ownership is forgotten without a state-editing script.
removed {
  from = infisical_secret.refresh_token_hmac_key_v1
  lifecycle {
    destroy = false
  }
}
removed {
  from = infisical_secret.whatsapp_webhook_verify_token
  lifecycle {
    destroy = false
  }
}
removed {
  from = infisical_secret.microservices_auth_jwt_private_key_v1
  lifecycle {
    destroy = false
  }
}
