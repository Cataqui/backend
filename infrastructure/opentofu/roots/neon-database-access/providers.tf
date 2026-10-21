provider "infisical" {}

# Apply with PGOPTIONS='-c createrole_self_grant=set,inherit' so newly created
# Auth roles can own databases and objects administered by the creating role.
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
