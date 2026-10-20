locals {
  platforms = jsondecode(file("${path.module}/../../../platforms.json"))
  manifest  = jsondecode(file("${path.module}/../../../manifest.json"))

  infisical_project_id = module.infisical_project.id

  refresh_token_hmac_key_version        = 1
  whatsapp_webhook_verify_token_version = 1

  refresh_token_hmac_key_base64url = trimsuffix(
    replace(
      replace(ephemeral.random_bytes.refresh_token_hmac_v1.base64, "+", "-"),
      "/",
      "_",
    ),
    "=",
  )
  whatsapp_webhook_verify_token_base64url = trimsuffix(
    replace(
      replace(ephemeral.random_bytes.whatsapp_webhook_verify_token.base64, "+", "-"),
      "/",
      "_",
    ),
    "=",
  )
  static_map_location_signing_key_base64url = trimsuffix(
    replace(
      replace(ephemeral.random_bytes.static_map_signing.base64, "+", "-"),
      "/",
      "_",
    ),
    "=",
  )
}
