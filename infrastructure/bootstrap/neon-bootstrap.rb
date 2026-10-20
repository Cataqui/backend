# frozen_string_literal: true

require "json"
require "uri"
require_relative "bootstrap-runtime"
require_relative "infisical-bootstrap"
require_relative "neon-reconciliation"
require_relative "reconciliation"

module Bootstrap
  module_function

  NEON_API_BASE_URL = "https://console.neon.tech/api/v2"

  def _neon_management_environment
    ENV.to_h.reject { |name, _value| ["NEON_API_KEY", "NEON_PROFILE"].include?(name) }
  end

  def _run_neon_async(args:)
    run_async("neon", args + ["--profile", "DEFAULT", "--output", "json", "--no-analytics"],
              env: _neon_management_environment)
  end

  def _neon_parse_json(result:, operation:)
    JSON.parse(result.fetch("stdout"))
  rescue JSON::ParserError, TypeError
    raise "Neon CLI returned invalid JSON while attempting to #{operation}."
  end

  def _neon_normalize_api_key_inventory(payload:)
    raise "Neon CLI returned an invalid API key inventory." unless payload.is_a?(Array)

    payload.map do |key|
      unless key.is_a?(Hash) && key["id"].is_a?(Integer) && key["id"].positive? &&
             key["id"] <= 9_007_199_254_740_991 && key["name"].is_a?(String) &&
             (key["project_id"].nil? || key["project_id"].is_a?(String))
        raise "Neon CLI returned invalid API key metadata."
      end

      { "id" => key["id"], "name" => key["name"], "project_id" => key["project_id"] }
    end
  end

  def _neon_list_account_api_keys
    _neon_normalize_api_key_inventory(payload: _neon_parse_json(
      result: _run_neon_async(args: ["api-keys", "list"]), operation: "list account API keys"
    ))
  end

  def _neon_fetch_with_credential(url:, key:)
    http_request(url, headers: { "accept" => "application/json", "authorization" => "Bearer #{key}" })
  rescue StandardError
    nil
  end

  def _neon_response_json(response:)
    JSON.parse(response.body)
  rescue JSON::ParserError, TypeError
    nil
  end

  def _neon_verify_account_api_key(platforms:, key:)
    KNOWN_SECRETS.add(key)
    user_response = _neon_fetch_with_credential(url: "#{NEON_API_BASE_URL}/users/me", key: key)
    return "indeterminate" unless user_response

    user_status = classify_neon_credential_response(status: user_response.code.to_i)
    return user_status unless user_status == "accepted"

    user = _neon_response_json(response: user_response)
    return "indeterminate" unless user.is_a?(Hash)

    user_id = user["id"] || (user["user"].is_a?(Hash) ? user["user"]["id"] : nil)
    return "indeterminate" unless user_id.is_a?(String) && !user_id.empty?

    account_keys_response = _neon_fetch_with_credential(url: "#{NEON_API_BASE_URL}/api_keys", key: key)
    return "indeterminate" unless account_keys_response
    return "rejected" if account_keys_response.code.to_i == 401
    return "foreign" if account_keys_response.code.to_i == 403
    return "indeterminate" unless account_keys_response.code.to_i.between?(200, 299)

    organization_id = URI.encode_www_form_component(platforms.fetch("neon").fetch("organization_id")).gsub("+", "%20")
    members_response = _neon_fetch_with_credential(
      url: "#{NEON_API_BASE_URL}/organizations/#{organization_id}/members?limit=500", key: key
    )
    return "indeterminate" unless members_response
    return "rejected" if members_response.code.to_i == 401
    return "foreign" if [403, 404].include?(members_response.code.to_i)
    return "indeterminate" unless members_response.code.to_i.between?(200, 299)

    members_payload = _neon_response_json(response: members_response)
    return "indeterminate" unless members_payload.is_a?(Hash) && members_payload["members"].is_a?(Array)

    account_membership = members_payload["members"].find do |entry|
      next false unless entry.is_a?(Hash)

      member = entry["member"].is_a?(Hash) ? entry["member"] : {}
      (member["user_id"] || entry["user_id"]) == user_id
    end
    return "foreign" unless account_membership

    member = account_membership["member"].is_a?(Hash) ? account_membership["member"] : {}
    (member["role"] || account_membership["role"]) == "admin" ? "accepted" : "foreign"
  end

  def _neon_create_account_api_key(expected_name:)
    payload = _neon_parse_json(
      result: _run_neon_async(args: ["api-keys", "create", "--name", expected_name]),
      operation: "create #{expected_name}"
    )
    KNOWN_SECRETS.add(payload["key"]) if payload.is_a?(Hash) && payload["key"].is_a?(String) && !payload["key"].empty?
    normalize_created_neon_account_api_key(payload: payload, expected_name: expected_name)
  end

  def _neon_revoke_account_api_key(key_id:)
    payload = _neon_parse_json(
      result: _run_neon_async(args: ["api-keys", "revoke", key_id.to_s]),
      operation: "revoke Neon account API key #{key_id}"
    )
    unless payload.is_a?(Hash) && payload["id"] == Integer(key_id) && payload["revoked"] == true
      raise "Neon CLI could not verify revocation of account API key #{key_id}."
    end
  end

  def _neon_read_stored_account_credential(infisical_project_id:, infisical_token:)
    ENVIRONMENTS.to_h do |environment|
      [environment, {
        "key" => get_bootstrap_secret(project_id: infisical_project_id, token: infisical_token,
                                      environment: environment, name: "NEON_ACCOUNT_API_KEY"),
        "id" => get_bootstrap_secret(project_id: infisical_project_id, token: infisical_token,
                                     environment: environment, name: "NEON_ACCOUNT_API_KEY_ID")
      }]
    end
  end

  def _neon_assert_healthy(platforms:, manifest:, infisical_project_id:, infisical_token:)
    expected_name = get_neon_account_api_key_name(manifest: manifest)
    stored_by_environment = _neon_read_stored_account_credential(
      infisical_project_id: infisical_project_id, infisical_token: infisical_token
    )
    stored_key = stored_by_environment.fetch("staging")["key"] || stored_by_environment.fetch("production")["key"]
    credential_status = if stored_key && !stored_key.empty?
                          _neon_verify_account_api_key(platforms: platforms, key: stored_key)
                        else
                          "missing"
                        end
    decision = decide_neon_account_credential(
      expected_name: expected_name, stored_by_environment: stored_by_environment,
      inventory: _neon_list_account_api_keys, credential_status: credential_status
    )
    raise "Final Neon account API key verification failed." unless decision.fetch("action") == "reuse"
  end

  def verify_neon_cli_authentication_async
    profiles = _neon_parse_json(
      result: run_async("neon", ["profile", "list", "--output", "json", "--no-analytics"],
                        env: _neon_management_environment),
      operation: "inspect the authenticated profile"
    )
    raise "Neon CLI returned an invalid profile inventory." unless profiles.is_a?(Array)

    default_profiles = profiles.select { |profile| profile.is_a?(Hash) && profile["name"] == "DEFAULT" }
    unless default_profiles.length == 1 && default_profiles[0]["auth"] == "oauth"
      raise "Neon DEFAULT profile must be authenticated through `neon auth` before bootstrap."
    end
    _neon_list_account_api_keys
  end

  def reconcile_neon_account_api_key(platforms:, manifest:, infisical_project_id:, infisical_token:)
    expected_name = get_neon_account_api_key_name(manifest: manifest)
    stored_by_environment = _neon_read_stored_account_credential(
      infisical_project_id: infisical_project_id, infisical_token: infisical_token
    )
    decision = reconcile_neon_account_credential(
      expected_name: expected_name, stored_by_environment: stored_by_environment,
      inventory: _neon_list_account_api_keys,
      verify_key: ->(key) { _neon_verify_account_api_key(platforms: platforms, key: key) },
      revoke_key: ->(key_id) { _neon_revoke_account_api_key(key_id: key_id) },
      create_key: -> { _neon_create_account_api_key(expected_name: expected_name) },
      write_key: lambda do |environment, key|
        set_bootstrap_secret(project_id: infisical_project_id, token: infisical_token,
                             environment: environment, name: "NEON_ACCOUNT_API_KEY", value: key)
      end,
      write_key_id: lambda do |environment, key_id|
        set_bootstrap_secret(project_id: infisical_project_id, token: infisical_token,
                             environment: environment, name: "NEON_ACCOUNT_API_KEY_ID", value: key_id)
      end
    )
    log("Neon account API key: #{decision.fetch('action')}.")
    _neon_assert_healthy(platforms: platforms, manifest: manifest,
                         infisical_project_id: infisical_project_id, infisical_token: infisical_token)
  end
end
