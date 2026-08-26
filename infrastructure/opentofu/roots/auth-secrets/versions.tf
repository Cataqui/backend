terraform {
  required_version = "= 1.12.6"

  required_providers {
    infisical = {
      source  = "infisical/infisical"
      version = "= 0.19.21"
    }
    random = {
      source  = "hashicorp/random"
      version = "= 3.9.0"
    }
    tls = {
      source  = "hashicorp/tls"
      version = "= 4.3.0"
    }
  }

  backend "s3" {}
}
