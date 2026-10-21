# frozen_string_literal: true

require "digest"
require "json"
require "openssl"
require "securerandom"
require "time"
require "uri"
require_relative "bootstrap-runtime"
require_relative "cloudflare-reconciliation"
require_relative "infisical-bootstrap"
require_relative "reconciliation"

module Bootstrap
  CLOUDFLARE_API_BASE_URL = "https://api.cloudflare.com/client/v4".freeze

  def self._cloudflare_verify_token(token)
    KNOWN_SECRETS.add(token)
    headers = { "accept" => "application/json", "authorization" => "Bearer #{token}" }
    response = http_request("#{CLOUDFLARE_API_BASE_URL}/user/tokens/verify", headers: headers)
    status = response.code.to_i
    return false if classify_credential_response(status: status) == "rejected"
    raise "Cloudflare token verification failed with #{status}." unless (200...300).cover?(status)

    verification = JSON.parse(response.body)
    return false unless verification["success"] && verification.dig("result", "status") == "active"

    response = http_request("#{CLOUDFLARE_API_BASE_URL}/user/tokens/permission_groups", headers: headers)
    status = response.code.to_i
    return false if classify_credential_response(status: status) == "rejected"
    raise "Cloudflare permission verification failed with #{status}." unless (200...300).cover?(status)

    permissions = JSON.parse(response.body)
    (permissions["result"] || []).any? { |permission| permission["name"] == "API Tokens Write" }
  end

  def self.resolve_cloudflare_bootstrap_token(infisical_project_id, infisical_token)
    stored = ENVIRONMENTS.map do |environment|
      get_bootstrap_secret(
        project_id: infisical_project_id,
        token: infisical_token,
        environment: environment,
        name: "CLOUDFLARE_API_TOKEN"
      )
    end
    distinct = stored.reject { |value| value.nil? || value.empty? }.uniq
    raise "Staging and production contain different Cloudflare bootstrap tokens." if distinct.length > 1

    token = distinct.first
    unless token && _cloudflare_verify_token(token)
      token = prompt_hidden(
        title: "Cloudflare bootstrap token",
        message: "Paste CLOUDFLARE_API_TOKEN",
        guidance: [
          "Create a Cloudflare API token with API Tokens Write.",
          "This is the external issuer used to create narrower OpenTofu-managed tokens.",
          "Bootstrap stores it in both environments at /opentofu/bootstrap."
        ].join("\n"),
        unavailable_message: "A valid Cloudflare bootstrap token is missing; rerun from an interactive terminal."
      )
      unless token && !token.empty? && _cloudflare_verify_token(token)
        raise "The supplied Cloudflare bootstrap token is invalid or lacks API Tokens Write."
      end
    end

    ENVIRONMENTS.each do |environment|
      set_bootstrap_secret(
        project_id: infisical_project_id,
        token: infisical_token,
        environment: environment,
        name: "CLOUDFLARE_API_TOKEN",
        value: token
      )
    end
    token
  end

  def self._cloudflare_list_tokens(cloudflare_token)
    payload = request_json(
      "#{CLOUDFLARE_API_BASE_URL}/user/tokens?per_page=100",
      headers: { "authorization" => "Bearer #{cloudflare_token}" }
    )
    payload["result"] || []
  end

  def self._cloudflare_get_r2_permission_group(cloudflare_token)
    payload = request_json(
      "#{CLOUDFLARE_API_BASE_URL}/user/tokens/permission_groups",
      headers: { "authorization" => "Bearer #{cloudflare_token}" }
    )
    permissions = (payload["result"] || []).select do |permission|
      permission["name"] == "Workers R2 Storage Bucket Item Write" &&
        (permission["scopes"] || []).include?("com.cloudflare.edge.r2.bucket")
    end
    unless permissions.length == 1
      raise "Cloudflare must expose exactly one bucket-scoped R2 object write permission group."
    end

    permissions.first
  end

  def self._cloudflare_get_token(cloudflare_token, token_id)
    payload = request_json(
      "#{CLOUDFLARE_API_BASE_URL}/user/tokens/#{URI.encode_uri_component(token_id)}",
      headers: { "authorization" => "Bearer #{cloudflare_token}" }
    )
    payload["result"]
  end

  def self._cloudflare_owned_r2_token?(platforms:, manifest:, token:, permission_group_id:)
    account_id = platforms.fetch("cloudflare").fetch("account_id")
    bucket = manifest.fetch("cloudflare").fetch("r2").fetch("buckets").fetch("opentofu_state")
    resource = "com.cloudflare.edge.r2.bucket.#{account_id}_default_#{bucket}"
    policies = token["policies"]
    return false unless policies.is_a?(Array) && policies.length == 1

    policy = policies.first
    groups = policy["permission_groups"]
    policy["effect"] == "allow" && groups.is_a?(Array) && groups.length == 1 &&
      groups.first["id"] == permission_group_id && (policy["resources"] || {}).length == 1 &&
      policy.dig("resources", resource) == "*"
  end

  def self._cloudflare_create_r2_token(platforms:, manifest:, cloudflare_token:, name:)
    permission = _cloudflare_get_r2_permission_group(cloudflare_token)
    account_id = platforms.fetch("cloudflare").fetch("account_id")
    bucket = manifest.fetch("cloudflare").fetch("r2").fetch("buckets").fetch("opentofu_state")
    payload = request_json(
      "#{CLOUDFLARE_API_BASE_URL}/user/tokens",
      method: "POST",
      headers: { "authorization" => "Bearer #{cloudflare_token}" },
      body: {
        "name" => name,
        "policies" => [
          {
            "effect" => "allow",
            "permission_groups" => [{ "id" => permission.fetch("id") }],
            "resources" => { "com.cloudflare.edge.r2.bucket.#{account_id}_default_#{bucket}" => "*" }
          }
        ]
      },
      accepted_statuses: [200, 201]
    )
    token = payload["result"]
    unless token && token["id"] && !token["id"].empty? && token["value"] && !token["value"].empty?
      raise "Cloudflare did not return credentials for #{name}."
    end

    KNOWN_SECRETS.add(token.fetch("value"))
    { "id" => token.fetch("id"), "secret" => Digest::SHA256.hexdigest(token.fetch("value")) }
  end

  def self._cloudflare_delete_token(cloudflare_token, token_id)
    request_json(
      "#{CLOUDFLARE_API_BASE_URL}/user/tokens/#{URI.encode_uri_component(token_id)}",
      method: "DELETE",
      headers: { "authorization" => "Bearer #{cloudflare_token}" },
      accepted_statuses: [200]
    )
  end

  def self._cloudflare_hmac(key, value, hex: false)
    return OpenSSL::HMAC.hexdigest("SHA256", key, value) if hex

    OpenSSL::HMAC.digest("SHA256", key, value)
  end

  def self._cloudflare_signed_r2_request(platforms:, manifest:, access_key_id:, secret_access_key:, method:, key:, body: "")
    account_id = platforms.fetch("cloudflare").fetch("account_id")
    bucket = manifest.fetch("cloudflare").fetch("r2").fetch("buckets").fetch("opentofu_state")
    host = "#{account_id}.r2.cloudflarestorage.com"
    uri = "/#{([bucket] + key.split("/")).map { |part| URI.encode_uri_component(part) }.join("/")}"
    amz_date = Time.now.utc.strftime("%Y%m%dT%H%M%SZ")
    date = amz_date[0, 8]
    payload_hash = Digest::SHA256.hexdigest(body)
    canonical_headers = "host:#{host}\nx-amz-content-sha256:#{payload_hash}\nx-amz-date:#{amz_date}\n"
    signed_headers = "host;x-amz-content-sha256;x-amz-date"
    canonical_request = [method, uri, "", canonical_headers, signed_headers, payload_hash].join("\n")
    scope = "#{date}/auto/s3/aws4_request"
    string_to_sign = ["AWS4-HMAC-SHA256", amz_date, scope, Digest::SHA256.hexdigest(canonical_request)].join("\n")
    date_key = _cloudflare_hmac("AWS4#{secret_access_key}", date)
    region_key = _cloudflare_hmac(date_key, "auto")
    service_key = _cloudflare_hmac(region_key, "s3")
    signing_key = _cloudflare_hmac(service_key, "aws4_request")
    signature = _cloudflare_hmac(signing_key, string_to_sign, hex: true)
    http_request(
      "https://#{host}#{uri}",
      method: method,
      headers: {
        "authorization" => "AWS4-HMAC-SHA256 Credential=#{access_key_id}/#{scope}, SignedHeaders=#{signed_headers}, Signature=#{signature}",
        "x-amz-content-sha256" => payload_hash,
        "x-amz-date" => amz_date
      },
      body: method == "PUT" ? body : nil
    )
  end

  def self.probe_r2_credentials(platforms:, manifest:, access_key_id:, secret_access_key:)
    key = "__bootstrap_probe__/#{SecureRandom.uuid}"
    body = SecureRandom.uuid
    put = _cloudflare_signed_r2_request(
      platforms: platforms, manifest: manifest, access_key_id: access_key_id,
      secret_access_key: secret_access_key, method: "PUT", key: key, body: body
    )
    status = put.code.to_i
    return false if classify_credential_response(status: status) == "rejected"
    raise "R2 credential verification could not write its probe (#{status})." unless (200...300).cover?(status)

    get = _cloudflare_signed_r2_request(
      platforms: platforms, manifest: manifest, access_key_id: access_key_id,
      secret_access_key: secret_access_key, method: "GET", key: key
    )
    status = get.code.to_i
    return false if classify_credential_response(status: status) == "rejected"
    raise "R2 credential verification could not read its probe (#{status})." unless (200...300).cover?(status)
    raise "R2 credential verification read unexpected probe contents." unless constant_time_equal(left: get.body, right: body)

    deletion = _cloudflare_signed_r2_request(
      platforms: platforms, manifest: manifest, access_key_id: access_key_id,
      secret_access_key: secret_access_key, method: "DELETE", key: key
    )
    status = deletion.code.to_i
    raise "R2 credential verification could not remove its probe (#{status})." unless (200...300).cover?(status)

    true
  end

  def self._cloudflare_parse_cf_json(result, operation)
    payload = JSON.parse(result.fetch("stdout"))
    raise "cf returned an invalid response while checking #{operation}." unless payload.is_a?(Hash)

    payload
  rescue JSON::ParserError
    raise "cf returned an invalid response while checking #{operation}."
  end

  def self.ensure_private_r2_bucket(platforms:, manifest:)
    bucket = manifest.fetch("cloudflare").fetch("r2").fetch("buckets").fetch("opentofu_state")
    command_environment = ENV.to_h.merge("CLOUDFLARE_ACCOUNT_ID" => platforms.fetch("cloudflare").fetch("account_id"))
    buckets = []
    start_after = nil
    loop do
      args = ["r2", "buckets", "list", "--name-contains", bucket, "--order", "name", "--direction", "asc", "--per-page", "1000"]
      args += ["--start-after", start_after] if start_after
      page = _cloudflare_parse_cf_json(run_async("cf", args, env: command_environment), "R2 bucket discovery")
      entries = page["buckets"]
      unless entries.is_a?(Array) && entries.all? { |entry| entry.is_a?(Hash) && entry["name"].is_a?(String) && !entry.fetch("name").empty? }
        raise "cf returned an invalid response while discovering R2 bucket #{bucket}."
      end
      break if entries.empty?

      names = entries.map { |entry| entry.fetch("name") }
      ordered_page = names == names.sort.uniq && (start_after.nil? || names.first > start_after)
      raise "cf returned an invalid R2 bucket discovery order for #{bucket}." unless ordered_page

      buckets.concat(entries)
      # cf omits the API's cursor metadata. Its supported name ordering and
      # start-after filter provide complete pagination without parsing CLI text.
      start_after = names.last
    end
    existing = resolve_unique_named_resource(resources: buckets, expected_name: bucket)
    run_async("cf", ["r2", "buckets", "create", "--name", bucket], env: command_environment) unless existing

    details = _cloudflare_parse_cf_json(
      run_async("cf", ["r2", "buckets", "get", bucket], env: command_environment), "R2 bucket #{bucket}"
    )
    raise "cf returned a foreign R2 bucket for #{bucket}." unless details["name"] == bucket

    domains = _cloudflare_parse_cf_json(
      run_async("cf", ["r2", "buckets", "domains", "custom", "list", "--bucket-name", bucket], env: command_environment),
      "custom-domain exposure for #{bucket}"
    )
    raise "Unable to verify custom-domain exposure for #{bucket}." unless domains["domains"].is_a?(Array)
    raise "R2 state bucket #{bucket} has a public custom domain." unless domains.fetch("domains").empty?

    dev_url = _cloudflare_parse_cf_json(
      run_async("cf", ["r2", "buckets", "domains", "managed", "list", "--bucket-name", bucket], env: command_environment),
      "development URL exposure for #{bucket}"
    )
    raise "Unable to verify public development URL exposure for #{bucket}." unless [true, false].include?(dev_url["enabled"])
    raise "R2 state bucket #{bucket} has a public development URL." if dev_url.fetch("enabled")
  end

  def self.reconcile_r2_credentials(platforms:, manifest:, infisical_project_id:, infisical_token:, cloudflare_token:)
    tokens = _cloudflare_list_tokens(cloudflare_token)
    permission = _cloudflare_get_r2_permission_group(cloudflare_token)
    ENVIRONMENTS.each do |environment|
      name = get_r2_token_name(manifest: manifest, environment: environment)
      summary = resolve_unique_named_resource(resources: tokens, expected_name: name)
      token = summary ? _cloudflare_get_token(cloudflare_token, summary.fetch("id")) : nil
      if token && !_cloudflare_owned_r2_token?(
        platforms: platforms, manifest: manifest, token: token, permission_group_id: permission.fetch("id")
      )
        raise "Foreign Cloudflare token conflicts with #{name}."
      end

      access_key_id = get_bootstrap_secret(
        project_id: infisical_project_id, token: infisical_token,
        environment: environment, name: "R2_STATE_ACCESS_KEY_ID"
      )
      secret_access_key = get_bootstrap_secret(
        project_id: infisical_project_id, token: infisical_token,
        environment: environment, name: "R2_STATE_SECRET_ACCESS_KEY"
      )
      probe_succeeded = token && access_key_id && !access_key_id.empty? && secret_access_key && !secret_access_key.empty? &&
        probe_r2_credentials(platforms: platforms, manifest: manifest, access_key_id: access_key_id, secret_access_key: secret_access_key)
      action = decide_r2_credentials(
        token: token, access_key_id: access_key_id, secret_access_key: secret_access_key,
        probe_succeeded: !!probe_succeeded
      )
      next if action == "reuse"

      _cloudflare_delete_token(cloudflare_token, token.fetch("id")) if token
      credentials = _cloudflare_create_r2_token(
        platforms: platforms, manifest: manifest, cloudflare_token: cloudflare_token, name: name
      )
      set_bootstrap_secret(
        project_id: infisical_project_id, token: infisical_token, environment: environment,
        name: "R2_STATE_ACCESS_KEY_ID", value: credentials.fetch("id")
      )
      set_bootstrap_secret(
        project_id: infisical_project_id, token: infisical_token, environment: environment,
        name: "R2_STATE_SECRET_ACCESS_KEY", value: credentials.fetch("secret")
      )
      unless probe_r2_credentials(
        platforms: platforms, manifest: manifest, access_key_id: credentials.fetch("id"),
        secret_access_key: credentials.fetch("secret")
      )
        raise "New #{environment} R2 credentials could not access the state bucket."
      end

      tokens = _cloudflare_list_tokens(cloudflare_token)
    end
  end
end
