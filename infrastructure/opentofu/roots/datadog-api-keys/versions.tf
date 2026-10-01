terraform {
  required_version = "= 1.12.6"

  required_providers {
    datadog = {
      source  = "DataDog/datadog"
      version = "= 4.23.0"
    }
    infisical = {
      source  = "infisical/infisical"
      version = "= 0.19.21"
    }
  }

  backend "s3" {}
}
