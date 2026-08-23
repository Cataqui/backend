terraform {
  required_version = "~> 1.15.0"

  cloud {}

  required_providers {
    neon = {
      source  = "kislerdm/neon"
      version = "~> 0.14.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.7.0"
    }
  }
}
