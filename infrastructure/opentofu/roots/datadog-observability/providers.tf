provider "datadog" {
  api_url = "https://api.${local.platforms.datadog.site}/"
}
