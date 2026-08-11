terraform {
  required_version = "~> 1.15.0"

  cloud {}

  required_providers {
    upstash = {
      source  = "upstash/upstash"
      version = "~> 2.1.0"
    }
  }
}
