locals {
  platforms = jsondecode(file("${path.module}/../../../platforms.json"))

  cloudflare_account_id = regex("^[0-9a-f]{32}$", local.platforms.cloudflare.account_id)
  infisical_project_id  = regex("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", local.platforms.infisical.project_id)
  google_cloud_project_id = regex(
    "^[a-z][a-z0-9-]{4,28}[a-z0-9]$",
    data.terraform_remote_state.google_cloud_projects.outputs.project_id,
  )

  mobile_applications = {
    staging = {
      android = {
        package_name = "com.cataqui.mobile.development"
        sha1_fingerprints = [
          "82:A4:3C:C0:D0:4B:DF:3E:D4:7D:54:9C:0A:D2:F2:A8:FF:FA:C3:23",
        ]
      }
      ios = {
        bundle_id = "com.cataqui.mobile.development"
      }
    }
    production = {
      android = {
        package_name = "com.cataqui.mobile"
        sha1_fingerprints = [
          "F7:23:7F:BA:F4:7D:92:FD:22:07:C2:B7:D9:13:12:59:81:C5:3E:5E",
          "C8:14:5D:D5:EF:25:98:4B:8A:D9:E5:4D:1D:1A:F4:98:03:D9:1B:75",
          "18:73:97:49:E9:97:9A:B4:37:D6:E4:8E:85:AF:9D:95:2D:90:CD:B3",
        ]
      }
      ios = {
        bundle_id = "com.cataqui.mobile"
      }
    }
  }

  mobile_application = local.mobile_applications[var.environment]
  android_package_name = regex(
    "^[a-z][a-z0-9_.]*[.][a-z][a-z0-9_]*$",
    local.mobile_application.android.package_name,
  )
  android_sha1_fingerprints = toset([
    for fingerprint in local.mobile_application.android.sha1_fingerprints : regex(
      "^[0-9a-f]{40}$",
      lower(replace(fingerprint, ":", "")),
    )
  ])
  ios_bundle_id = regex(
    "^[A-Za-z][A-Za-z0-9.-]*[.][A-Za-z][A-Za-z0-9-]*$",
    local.mobile_application.ios.bundle_id,
  )

  maps_platform_services = toset([
    "apikeys.googleapis.com",
    "maps-android-backend.googleapis.com",
    "maps-ios-backend.googleapis.com",
    "places.googleapis.com",
  ])
}
