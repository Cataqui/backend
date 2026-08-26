terraform {
  required_version = "= 1.12.6"

  required_providers {
    infisical = {
      source  = "infisical/infisical"
      version = "= 0.19.21"
    }
    postgresql = {
      source  = "cyrilgdn/postgresql"
      version = "= 1.27.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "= 3.9.0"
    }
  }

  backend "s3" {}
}
