provider "infisical" {}

provider "postgresql" {
  host            = ephemeral.infisical_secret.database_owner_host.value
  port            = 5432
  database        = local.database_name
  username        = local.database_owner_username
  password        = ephemeral.infisical_secret.database_owner_password.value
  sslmode         = "require"
  connect_timeout = 15
  superuser       = false
}

provider "random" {}
