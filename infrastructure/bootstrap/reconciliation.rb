# frozen_string_literal: true

require "openssl"

module Bootstrap
  ENVIRONMENTS = %w[staging production].freeze
  PROJECT_ID_PATTERN = /\A[a-z][a-z0-9-]{4,28}[a-z0-9]\z/
  GOOGLE_ACCOUNT_PATTERN = /\A[0-9A-F]{6}-[0-9A-F]{6}-[0-9A-F]{6}\z/
  LOWERCASE_NAME_PATTERN = /\A[a-z][a-z0-9-]{1,62}[a-z0-9]\z/
  EMAIL_PATTERN = /\A[^\s@]+@[^\s@]+\.[^\s@]+\z/

  def self._require_string(value:, path:, pattern: nil)
    unless value.is_a?(String) && !value.empty? && (!pattern || pattern.match?(value))
      raise "Invalid non-secret infrastructure identifier: #{path}."
    end
    value
  end

  def self._require_exact_keys(value:, expected_keys:, path:)
    raise "Invalid infrastructure configuration object: #{path}." unless value.is_a?(Hash)
    unless value.keys.sort == expected_keys.sort
      raise "Unexpected keys in infrastructure configuration object: #{path}."
    end
  end

  def self.validate_platforms(platforms:)
    _require_exact_keys(value: platforms, expected_keys: %w[cloudflare google_cloud infisical github neon upstash], path: "platforms")
    _require_exact_keys(value: platforms["cloudflare"], expected_keys: %w[account_id zones], path: "platforms.cloudflare")
    _require_exact_keys(value: platforms.dig("cloudflare", "zones"), expected_keys: ["cataqui.com"], path: "platforms.cloudflare.zones")
    _require_exact_keys(value: platforms.dig("cloudflare", "zones", "cataqui.com"), expected_keys: ["zone_id"], path: "platforms.cloudflare.zones.cataqui.com")
    _require_exact_keys(value: platforms["google_cloud"], expected_keys: %w[organization_id billing_account_id], path: "platforms.google_cloud")
    _require_exact_keys(value: platforms["infisical"], expected_keys: ["organization_id"], path: "platforms.infisical")
    _require_exact_keys(value: platforms["github"], expected_keys: ["repository"], path: "platforms.github")
    _require_exact_keys(value: platforms["neon"], expected_keys: ["organization_id"], path: "platforms.neon")
    _require_exact_keys(value: platforms["upstash"], expected_keys: ["account_email"], path: "platforms.upstash")

    _require_string(value: platforms.dig("cloudflare", "account_id"), path: "cloudflare.account_id", pattern: /\A[a-f0-9]{32}\z/)
    _require_string(value: platforms.dig("cloudflare", "zones", "cataqui.com", "zone_id"), path: "cloudflare.zones.cataqui.com.zone_id", pattern: /\A[a-f0-9]{32}\z/)
    _require_string(value: platforms.dig("google_cloud", "organization_id"), path: "google_cloud.organization_id", pattern: /\A\d+\z/)
    _require_string(value: platforms.dig("google_cloud", "billing_account_id"), path: "google_cloud.billing_account_id", pattern: GOOGLE_ACCOUNT_PATTERN)
    _require_string(value: platforms.dig("infisical", "organization_id"), path: "infisical.organization_id", pattern: /\A[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\z/)
    _require_string(value: platforms.dig("github", "repository"), path: "github.repository", pattern: /\A[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\z/)
    _require_string(value: platforms.dig("neon", "organization_id"), path: "neon.organization_id", pattern: /\Aorg-[a-z0-9-]+\z/)
    _require_string(value: platforms.dig("upstash", "account_email"), path: "upstash.account_email", pattern: EMAIL_PATTERN)
    platforms
  end

  def self.validate_manifest(manifest:)
    _require_exact_keys(value: manifest, expected_keys: %w[cloudflare google_cloud infisical github neon upstash], path: "manifest")
    _require_exact_keys(value: manifest["cloudflare"], expected_keys: %w[ai_gateways pages r2 hyperdrive], path: "manifest.cloudflare")
    _require_exact_keys(value: manifest.dig("cloudflare", "ai_gateways"), expected_keys: %w[api_staging api_production ai_staging ai_production], path: "manifest.cloudflare.ai_gateways")
    _require_exact_keys(value: manifest.dig("cloudflare", "pages"), expected_keys: %w[landing_staging landing_production], path: "manifest.cloudflare.pages")
    ENVIRONMENTS.each do |environment|
      project = manifest.dig("cloudflare", "pages", "landing_#{environment}")
      _require_exact_keys(value: project, expected_keys: ["name"], path: "manifest.cloudflare.pages.landing_#{environment}")
      _require_string(value: project["name"], path: "manifest.cloudflare.pages.landing_#{environment}.name", pattern: LOWERCASE_NAME_PATTERN)
    end
    if manifest.dig("cloudflare", "pages", "landing_staging", "name") == manifest.dig("cloudflare", "pages", "landing_production", "name")
      raise "manifest.cloudflare.pages must identify two distinct landing projects."
    end
    _require_exact_keys(value: manifest.dig("cloudflare", "hyperdrive"), expected_keys: ENVIRONMENTS.map { |environment| "auth_#{environment}" }, path: "manifest.cloudflare.hyperdrive")
    ENVIRONMENTS.each do |environment|
      configuration = manifest.dig("cloudflare", "hyperdrive", "auth_#{environment}")
      _require_exact_keys(value: configuration, expected_keys: ["name"], path: "manifest.cloudflare.hyperdrive.auth_#{environment}")
      _require_string(value: configuration["name"], path: "manifest.cloudflare.hyperdrive.auth_#{environment}.name", pattern: LOWERCASE_NAME_PATTERN)
    end
    _require_exact_keys(value: manifest.dig("cloudflare", "r2"), expected_keys: ["buckets"], path: "manifest.cloudflare.r2")
    _require_exact_keys(value: manifest.dig("cloudflare", "r2", "buckets"), expected_keys: %w[opentofu_state mapshot_staging mapshot_production], path: "manifest.cloudflare.r2.buckets")
    _require_exact_keys(value: manifest["google_cloud"], expected_keys: %w[projects github_auth], path: "manifest.google_cloud")
    _require_exact_keys(value: manifest.dig("google_cloud", "projects"), expected_keys: %w[cataqui_staging cataqui_production], path: "manifest.google_cloud.projects")
    ENVIRONMENTS.each do |environment|
      _require_exact_keys(value: manifest.dig("google_cloud", "projects", "cataqui_#{environment}"), expected_keys: %w[name id], path: "manifest.google_cloud.projects.cataqui_#{environment}")
    end
    _require_exact_keys(value: manifest.dig("google_cloud", "github_auth"), expected_keys: %w[workload_identity_pool_id workload_identity_provider_id service_accounts], path: "manifest.google_cloud.github_auth")
    _require_exact_keys(value: manifest.dig("google_cloud", "github_auth", "service_accounts"), expected_keys: %w[cataqui_backend_staging cataqui_backend_production], path: "manifest.google_cloud.github_auth.service_accounts")
    _require_exact_keys(value: manifest["infisical"], expected_keys: %w[project opentofu_identities], path: "manifest.infisical")
    _require_exact_keys(value: manifest.dig("infisical", "project"), expected_keys: %w[name slug], path: "manifest.infisical.project")
    _require_exact_keys(value: manifest.dig("infisical", "opentofu_identities"), expected_keys: %w[cataqui_backend_staging cataqui_backend_production], path: "manifest.infisical.opentofu_identities")
    _require_exact_keys(value: manifest["github"], expected_keys: ["environments"], path: "manifest.github")
    _require_exact_keys(value: manifest.dig("github", "environments"), expected_keys: ENVIRONMENTS, path: "manifest.github.environments")
    _require_exact_keys(value: manifest["neon"], expected_keys: %w[api_keys projects databases], path: "manifest.neon")
    _require_exact_keys(value: manifest.dig("neon", "api_keys"), expected_keys: %w[account_bootstrap project_access], path: "manifest.neon.api_keys")
    _require_exact_keys(value: manifest.dig("neon", "api_keys", "account_bootstrap"), expected_keys: ["name"], path: "manifest.neon.api_keys.account_bootstrap")
    _require_exact_keys(value: manifest.dig("neon", "api_keys", "project_access"), expected_keys: %w[cataqui_staging cataqui_production], path: "manifest.neon.api_keys.project_access")
    _require_exact_keys(value: manifest.dig("neon", "projects"), expected_keys: %w[cataqui_staging cataqui_production], path: "manifest.neon.projects")
    ENVIRONMENTS.each do |environment|
      _require_exact_keys(value: manifest.dig("neon", "api_keys", "project_access", "cataqui_#{environment}"), expected_keys: ["name"], path: "manifest.neon.api_keys.project_access.cataqui_#{environment}")
      _require_exact_keys(value: manifest.dig("neon", "projects", "cataqui_#{environment}"), expected_keys: ["name"], path: "manifest.neon.projects.cataqui_#{environment}")
    end
    _require_exact_keys(value: manifest.dig("neon", "databases"), expected_keys: %w[cataqui auth], path: "manifest.neon.databases")
    manifest.dig("neon", "databases").each do |name, database|
      _require_exact_keys(value: database, expected_keys: %w[name owner_role runtime_role], path: "manifest.neon.databases.#{name}")
      database.each do |field, value|
        _require_string(value: value, path: "manifest.neon.databases.#{name}.#{field}", pattern: /\A[a-z][a-z0-9_]*\z/)
      end
    end
    _require_exact_keys(value: manifest["upstash"], expected_keys: ["redis"], path: "manifest.upstash")
    _require_exact_keys(value: manifest.dig("upstash", "redis"), expected_keys: ["databases"], path: "manifest.upstash.redis")
    _require_exact_keys(value: manifest.dig("upstash", "redis", "databases"), expected_keys: %w[cataqui_api_staging cataqui_api_production cataqui_auth_staging cataqui_auth_production], path: "manifest.upstash.redis.databases")
    ENVIRONMENTS.each do |environment|
      %w[api auth].each do |application|
        database = manifest.dig("upstash", "redis", "databases", "cataqui_#{application}_#{environment}")
        _require_exact_keys(value: database, expected_keys: ["name"], path: "manifest.upstash.redis.databases.cataqui_#{application}_#{environment}")
        _require_string(value: database["name"], path: "manifest.upstash.redis.databases.cataqui_#{application}_#{environment}.name", pattern: LOWERCASE_NAME_PATTERN)
      end
    end

    _require_string(value: manifest.dig("cloudflare", "r2", "buckets", "opentofu_state"), path: "cloudflare.r2.buckets.opentofu_state", pattern: LOWERCASE_NAME_PATTERN)
    ENVIRONMENTS.each do |environment|
      _require_string(value: manifest.dig("cloudflare", "r2", "buckets", "mapshot_#{environment}"), path: "manifest.cloudflare.r2.buckets.mapshot_#{environment}", pattern: LOWERCASE_NAME_PATTERN)
    end
    bucket_names = manifest.dig("cloudflare", "r2", "buckets").values
    raise "manifest.cloudflare.r2 must identify distinct state, staging and production buckets." if bucket_names.uniq.length != bucket_names.length

    _require_string(value: manifest.dig("infisical", "project", "name"), path: "infisical.project.name")
    _require_string(value: manifest.dig("infisical", "project", "slug"), path: "infisical.project.slug", pattern: LOWERCASE_NAME_PATTERN)
    _require_string(value: manifest.dig("google_cloud", "github_auth", "workload_identity_pool_id"), path: "google_cloud.github_auth.workload_identity_pool_id", pattern: LOWERCASE_NAME_PATTERN)
    _require_string(value: manifest.dig("google_cloud", "github_auth", "workload_identity_provider_id"), path: "google_cloud.github_auth.workload_identity_provider_id", pattern: LOWERCASE_NAME_PATTERN)
    _require_string(value: manifest.dig("neon", "databases", "cataqui", "name"), path: "neon.databases.cataqui.name", pattern: /\A[a-z][a-z0-9_]*\z/)
    _require_string(value: manifest.dig("neon", "api_keys", "account_bootstrap", "name"), path: "neon.api_keys.account_bootstrap.name", pattern: LOWERCASE_NAME_PATTERN)
    _require_string(value: manifest.dig("neon", "databases", "cataqui", "owner_role"), path: "neon.databases.cataqui.owner_role", pattern: /\A[a-z][a-z0-9_]*\z/)
    _require_string(value: manifest.dig("neon", "databases", "cataqui", "runtime_role"), path: "neon.databases.cataqui.runtime_role", pattern: /\A[a-z][a-z0-9_]*\z/)
    ENVIRONMENTS.each do |environment|
      _require_string(value: manifest.dig("neon", "api_keys", "project_access", "cataqui_#{environment}", "name"), path: "neon.api_keys.project_access.cataqui_#{environment}.name", pattern: LOWERCASE_NAME_PATTERN)
      %w[api ai].each do |application|
        _require_string(value: manifest.dig("cloudflare", "ai_gateways", "#{application}_#{environment}"), path: "cloudflare.ai_gateways.#{application}_#{environment}", pattern: LOWERCASE_NAME_PATTERN)
      end
      _require_string(value: manifest.dig("neon", "projects", "cataqui_#{environment}", "name"), path: "neon.projects.cataqui_#{environment}.name", pattern: LOWERCASE_NAME_PATTERN)
      _require_string(value: manifest.dig("upstash", "redis", "databases", "cataqui_api_#{environment}", "name"), path: "upstash.redis.databases.cataqui_api_#{environment}.name", pattern: LOWERCASE_NAME_PATTERN)
      _require_string(value: manifest.dig("google_cloud", "projects", "cataqui_#{environment}", "name"), path: "google_cloud.projects.cataqui_#{environment}.name", pattern: LOWERCASE_NAME_PATTERN)
      _require_string(value: manifest.dig("google_cloud", "projects", "cataqui_#{environment}", "id"), path: "google_cloud.projects.cataqui_#{environment}.id", pattern: PROJECT_ID_PATTERN)
      _require_string(value: manifest.dig("infisical", "opentofu_identities", "cataqui_backend_#{environment}"), path: "infisical.opentofu_identities.cataqui_backend_#{environment}")
      _require_string(value: manifest.dig("google_cloud", "github_auth", "service_accounts", "cataqui_backend_#{environment}"), path: "google_cloud.github_auth.service_accounts.cataqui_backend_#{environment}", pattern: PROJECT_ID_PATTERN)
      _require_exact_keys(value: manifest.dig("github", "environments", environment), expected_keys: ["branches"], path: "manifest.github.environments.#{environment}")
      branches = manifest.dig("github", "environments", environment, "branches")
      unless branches.is_a?(Array) && !branches.empty? && branches.all? { |branch| branch.is_a?(String) && !branch.empty? }
        raise "Invalid branch policy: github.environments.#{environment}.branches."
      end
    end
    manifest
  end

  def self.resolve_unique_named_resource(resources:, expected_name:, owner_predicate: ->(_resource) { true })
    matches = resources.select { |resource| resource["name"] == expected_name }
    raise "Duplicate bootstrap ownership for #{expected_name}." if matches.length > 1
    return nil if matches.empty?
    raise "Foreign resource conflicts with #{expected_name}." unless owner_predicate.call(matches[0])
    matches[0]
  end

  def self.constant_time_equal(left:, right:)
    return false unless left.is_a?(String) && right.is_a?(String)
    left.bytesize == right.bytesize && OpenSSL.fixed_length_secure_compare(left, right)
  end

  def self.redact_secrets(value:, secrets:)
    secrets.reduce(value.to_s) do |redacted, secret|
      secret.is_a?(String) && secret.length >= 4 ? redacted.gsub(secret, "[REDACTED]") : redacted
    end
  end

  private_class_method :_require_string, :_require_exact_keys
end
