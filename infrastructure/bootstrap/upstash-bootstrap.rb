# frozen_string_literal: true

require "json"
require_relative "bootstrap-runtime"
require_relative "infisical-bootstrap"
require_relative "reconciliation"
require_relative "upstash-reconciliation"

module Bootstrap
  module_function

  UPSTASH_DATABASES_URL = "https://api.upstash.com/v2/redis/databases"

  def _upstash_verify_api_key(platforms:, api_key:)
    KNOWN_SECRETS.add(api_key)
    basic_credential = ["#{platforms.fetch('upstash').fetch('account_email')}:#{api_key}"].pack("m0")
    KNOWN_SECRETS.add(basic_credential)

    begin
      response = http_request(UPSTASH_DATABASES_URL,
                              headers: { "accept" => "application/json", "authorization" => "Basic #{basic_credential}" })
    rescue StandardError
      return "indeterminate"
    end
    status = classify_upstash_credential_response(status: response.code.to_i)
    return status unless status == "accepted"

    begin
      JSON.parse(response.body).is_a?(Array) ? "accepted" : "indeterminate"
    rescue JSON::ParserError, TypeError
      "indeterminate"
    end
  end

  def reconcile_upstash_api_key(platforms:, infisical_project_id:, infisical_token:)
    stored_by_environment = ENVIRONMENTS.to_h do |environment|
      [environment, get_bootstrap_secret(project_id: infisical_project_id, token: infisical_token,
                                         environment: environment, name: "UPSTASH_API_KEY")]
    end

    result = reconcile_upstash_credential(
      stored_by_environment: stored_by_environment,
      verify_key: ->(api_key) { _upstash_verify_api_key(platforms: platforms, api_key: api_key) },
      request_key: lambda do
        prompt_hidden(
          title: "Upstash management credential", message: "Paste UPSTASH_API_KEY",
          guidance: [
            "Create or copy the account-wide Management API key from the Upstash Console.",
            "Account: #{platforms.fetch('upstash').fetch('account_email')}",
            "Bootstrap validates it and stores the same key in both environments."
          ].join("\n"),
          unavailable_message: "A valid Upstash API key is missing; rerun from an interactive terminal."
        )
      end,
      write_key: lambda do |environment, api_key|
        set_bootstrap_secret(project_id: infisical_project_id, token: infisical_token,
                             environment: environment, name: "UPSTASH_API_KEY", value: api_key)
      end
    )
    log("Upstash API key: #{result.fetch('action')}.")
  end
end
