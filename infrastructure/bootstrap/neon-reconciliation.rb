# frozen_string_literal: true

require_relative "reconciliation"

module Bootstrap
  def self.classify_neon_credential_response(status:)
    return "accepted" if status >= 200 && status < 300
    return "rejected" if status == 401
    "indeterminate"
  end

  def self.get_neon_account_api_key_name(manifest:)
    manifest.dig("neon", "api_keys", "account_bootstrap", "name")
  end

  def self.get_neon_project_api_key_name(manifest:, environment:)
    manifest.dig("neon", "api_keys", "project_access", "cataqui_#{environment}", "name")
  end

  def self.normalize_created_neon_account_api_key(payload:, expected_name:)
    unless payload.is_a?(Hash) && payload["id"].is_a?(Integer) && payload["id"] > 0 && payload["id"] <= ((2**53) - 1) && payload["name"] == expected_name && payload["key"].is_a?(String) && !payload["key"].empty? && payload["project_id"].nil?
      raise "Neon CLI returned invalid credentials for #{expected_name}."
    end
    { "id" => payload["id"], "name" => payload["name"], "key" => payload["key"] }
  end

  def self._get_shared_stored_neon_credential(stored_by_environment:)
    staging = stored_by_environment["staging"] || {}
    production = stored_by_environment["production"] || {}
    staging_key = staging["key"]
    production_key = production["key"]
    staging_id = staging["id"].to_s
    production_id = production["id"].to_s
    if staging_key && !staging_key.empty? && production_key && !production_key.empty? && !constant_time_equal(left: staging_key, right: production_key)
      raise "Staging and production contain conflicting Neon account API keys."
    end
    if !staging_id.empty? && !production_id.empty? && staging_id != production_id
      raise "Staging and production contain conflicting Neon account API key IDs."
    end
    {
      "key" => staging["key"] || production["key"],
      "id" => [staging_id, production_id].find { |id| !id.empty? },
    }
  end

  def self._resolve_expected_neon_inventory(inventory:, expected_name:)
    named_keys = inventory.select { |key| key["name"] == expected_name }
    raise "Duplicate Neon bootstrap ownership for #{expected_name}." if named_keys.length > 1
    named_keys[0]
  end

  def self.decide_neon_account_credential(expected_name:, stored_by_environment:, inventory:, credential_status:)
    stored = _get_shared_stored_neon_credential(stored_by_environment: stored_by_environment)
    named_key = _resolve_expected_neon_inventory(inventory: inventory, expected_name: expected_name)
    has_stored_id = stored["id"].is_a?(String) && !stored["id"].empty?
    metadata_key = has_stored_id ? inventory.find { |key| key["id"].to_s == stored["id"] } : nil
    if metadata_key && metadata_key["name"] != expected_name
      raise "Foreign Neon account API key metadata conflicts with #{expected_name}."
    end
    if named_key && has_stored_id && named_key["id"].to_s != stored["id"]
      raise "Neon account API key metadata does not match #{expected_name}."
    end
    if credential_status == "indeterminate"
      raise "Unable to determine whether Neon account API key #{expected_name} is valid."
    end
    if credential_status == "foreign"
      raise "Neon account API key #{expected_name} has the wrong account or organization role."
    end
    if credential_status == "accepted"
      raise "Foreign Neon account credential conflicts with #{expected_name}." if !stored["key"] || stored["key"].empty? || !named_key
      key_id = named_key["id"].to_s
      missing_environments = ENVIRONMENTS.select do |environment|
        credential = stored_by_environment[environment] || {}
        !credential["key"] || credential["key"].empty? || (credential["id"] || "").to_s != key_id
      end
      return { "action" => missing_environments.empty? ? "reuse" : "repair", "keyId" => key_id, "missingEnvironments" => missing_environments }
    end
    return { "action" => "replace", "keyId" => named_key["id"].to_s } if named_key
    { "action" => "create" }
  end

  def self.reconcile_neon_account_credential(expected_name:, stored_by_environment:, inventory:, verify_key:, revoke_key:, create_key:, write_key:, write_key_id:)
    stored = _get_shared_stored_neon_credential(stored_by_environment: stored_by_environment)
    credential_status = stored["key"] && !stored["key"].empty? ? verify_key.call(stored["key"]) : "missing"
    decision = decide_neon_account_credential(expected_name: expected_name, stored_by_environment: stored_by_environment, inventory: inventory, credential_status: credential_status)
    return decision if decision["action"] == "reuse"
    if decision["action"] == "repair"
      credential = { "id" => decision["keyId"], "key" => stored["key"] }
      targets = decision["missingEnvironments"]
    else
      revoke_key.call(decision["keyId"]) if decision["action"] == "replace"
      credential = create_key.call
      targets = ENVIRONMENTS
    end
    unless credential.is_a?(Hash) && credential["id"] && !credential["id"].to_s.empty? && credential["key"] && !credential["key"].empty?
      raise "Neon did not return a complete account API key."
    end
    targets.each do |environment|
      write_key.call(environment, credential["key"])
      write_key_id.call(environment, credential["id"].to_s)
    end
    { "action" => decision["action"], "keyId" => credential["id"].to_s }
  end

  private_class_method :_get_shared_stored_neon_credential, :_resolve_expected_neon_inventory
end
