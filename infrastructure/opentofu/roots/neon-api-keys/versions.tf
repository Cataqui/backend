terraform {
  required_version = "= 1.12.6"

  required_providers {
    infisical = {
      source  = "infisical/infisical"
      version = "= 0.19.21"
    }
    neon = {
      source  = "kislerdm/neon"
      version = "= 0.15.0"
    }
  }

  backend "s3" {}
}
