terraform {
  required_version = "= 1.12.6"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "= 7.45.0"
    }
    infisical = {
      source  = "infisical/infisical"
      version = "= 0.19.21"
    }
  }

  backend "s3" {}
}
