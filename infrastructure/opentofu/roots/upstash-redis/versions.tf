terraform {
  required_version = "= 1.12.6"

  required_providers {
    infisical = {
      source  = "infisical/infisical"
      version = "= 0.19.21"
    }
    upstash = {
      source  = "upstash/upstash"
      version = "= 2.1.0"
    }
  }

  backend "s3" {}
}
