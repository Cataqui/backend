terraform {
  required_version = "= 1.12.6"

  required_providers {
    datadog = {
      source  = "DataDog/datadog"
      version = "= 4.19.0"
    }
  }

  backend "s3" {}
}
