# frozen_string_literal: true

require "json"
require "securerandom"
require "tmpdir"
require "uri"
require_relative "reconciliation"
require_relative "bootstrap-runtime"
require_relative "infisical-reconciliation"

module Bootstrap
  BOOTSTRAP_SECRET_PATH = "/opentofu/bootstrap"
  INFISICAL_API_BASE_URL = "https://app.infisical.com"

  module_function

  def _infisical_headers(token)
    { "authorization" => "Bearer #{token}" }
  end

  def _infisical_stable_json(value)
    case value
    when Array
      "[#{value.map { |item| _infisical_stable_json(item) }.sort.join(",")}]"
    when Hash
      "{#{value.keys.sort.map { |key| "#{JSON.generate(key)}:#{_infisical_stable_json(value[key])}" }.join(",")}}"
    else
      JSON.generate(value)
    end
  end

  def _infisical_normalize_permissions(permissions)
    permissions.flat_map do |permission|
      actions = permission["action"].is_a?(Array) ? permission["action"] : [permission["action"]]
      actions.map do |action|
        normalized = {
          "subject" => permission["subject"],
          "action" => action,
          "conditions" => permission["conditions"] || {}
        }
        normalized["inverted"] = true if permission["inverted"]
        normalized
      end
    end
  end

  def _infisical_oidc_matches(configuration:, desired:)
    desired.all? do |key, value|
      actual = configuration&.[](key)
      if key == "accessTokenTrustedIps" && actual.is_a?(Array)
        actual = actual.map do |address|
          {
            "ipAddress" => address.key?("prefix") ? "#{address["ipAddress"]}/#{address["prefix"]}" : address["ipAddress"]
          }
        end
      end
      _infisical_stable_json(actual) == _infisical_stable_json(value)
    end
  end

  def _infisical_list_projects(token, request)
    payload = request.call("#{INFISICAL_API_BASE_URL}/api/v1/projects", headers: _infisical_headers(token))
    raise "Infisical returned an invalid project inventory." unless payload["projects"].is_a?(Array)

    payload["projects"]
  end

  def reconcile_infisical_project(input, infisical_token, request: method(:request_json))
    expected_organization_id = input.fetch("platforms").fetch("infisical").fetch("organization_id")
    expected_name = input.fetch("manifest").fetch("infisical").fetch("project").fetch("name")
    expected_slug = input.fetch("manifest").fetch("infisical").fetch("project").fetch("slug")
    reconcile_infisical_project_state(
      expected_organization_id: expected_organization_id,
      expected_name: expected_name,
      expected_slug: expected_slug,
      list_projects: -> { _infisical_list_projects(infisical_token, request) },
      create_project: lambda {
        created = request.call(
          "#{INFISICAL_API_BASE_URL}/api/v1/projects",
          method: "POST",
          headers: _infisical_headers(infisical_token),
          body: {
            "projectName" => expected_name,
            "slug" => expected_slug,
            "type" => INFISICAL_PROJECT_TYPE,
            "shouldCreateDefaultEnvs" => false,
            "hasDeleteProtection" => true
          },
          accepted_statuses: [200, 201]
        )
        created["project"]
      },
      update_project: lambda { |project|
        updated = request.call(
          "#{INFISICAL_API_BASE_URL}/api/v1/projects/#{project.fetch("id")}",
          method: "PATCH",
          headers: _infisical_headers(infisical_token),
          body: { "name" => expected_name, "slug" => expected_slug, "hasDeleteProtection" => true },
          accepted_statuses: [200]
        )
        updated["project"]
      },
      create_environment: lambda { |parameters|
        project_id = parameters.fetch("projectId")
        environment = parameters.fetch("environment")
        request.call(
          "#{INFISICAL_API_BASE_URL}/api/v1/projects/#{project_id}/environments",
          method: "POST",
          headers: _infisical_headers(infisical_token),
          body: {
            "name" => environment == "staging" ? "Staging" : "Production",
            "slug" => environment,
            "position" => environment == "staging" ? 1 : 2
          },
          accepted_statuses: [200, 201]
        )
      }
    )
  end

  def get_infisical_secret(project_id:, token:, environment:, secret_path:, name:)
    query = URI.encode_www_form(
      "projectId" => project_id,
      "environment" => environment,
      "secretPath" => secret_path,
      "type" => "shared",
      "viewSecretValue" => "true",
      "expandSecretReferences" => "false"
    )
    url = "#{INFISICAL_API_BASE_URL}/api/v4/secrets/#{URI.encode_uri_component(name)}?#{query}"
    response = http_request(url, headers: { "accept" => "application/json" }.merge(_infisical_headers(token)))
    status = response.code.to_i
    return nil if status == 404
    raise "Infisical could not read #{name} in #{environment} (#{status})." unless status.between?(200, 299)

    payload = JSON.parse(response.body)
    value = payload.dig("secret", "secretValue")
    raise "Infisical returned an invalid secret response for #{name}." unless value.is_a?(String)

    KNOWN_SECRETS.add(value) unless value.empty?
    value
  end

  def set_infisical_secret(project_id:, token:, environment:, secret_path:, name:, value:)
    KNOWN_SECRETS.add(value)
    existing = get_infisical_secret(
      project_id: project_id, token: token, environment: environment, secret_path: secret_path, name: name
    )
    return if !existing.nil? && constant_time_equal(left: existing, right: value)

    method = existing.nil? ? "POST" : "PATCH"
    request_json(
      "#{INFISICAL_API_BASE_URL}/api/v4/secrets/#{URI.encode_uri_component(name)}",
      method: method,
      headers: _infisical_headers(token),
      body: {
        "projectId" => project_id,
        "environment" => environment,
        "secretPath" => secret_path,
        "secretValue" => value,
        "skipMultilineEncoding" => true,
        "type" => "shared"
      },
      accepted_statuses: method == "POST" ? [200, 201] : [200]
    )
  end

  def delete_infisical_secret(project_id:, token:, environment:, secret_path:, name:)
    existing = get_infisical_secret(
      project_id: project_id, token: token, environment: environment, secret_path: secret_path, name: name
    )
    return if existing.nil?

    request_json(
      "#{INFISICAL_API_BASE_URL}/api/v4/secrets/#{URI.encode_uri_component(name)}",
      method: "DELETE",
      headers: _infisical_headers(token),
      body: { "projectId" => project_id, "environment" => environment, "secretPath" => secret_path, "type" => "shared" },
      accepted_statuses: [200]
    )
  end

  def get_bootstrap_secret(project_id:, token:, environment:, name:)
    get_infisical_secret(
      project_id: project_id, token: token, environment: environment, secret_path: BOOTSTRAP_SECRET_PATH, name: name
    )
  end

  def set_bootstrap_secret(project_id:, token:, environment:, name:, value:)
    set_infisical_secret(
      project_id: project_id, token: token, environment: environment, secret_path: BOOTSTRAP_SECRET_PATH,
      name: name, value: value
    )
  end

  def delete_bootstrap_secret(project_id:, token:, environment:, name:)
    delete_infisical_secret(
      project_id: project_id, token: token, environment: environment, secret_path: BOOTSTRAP_SECRET_PATH, name: name
    )
  end

  def _infisical_ensure_folder(project_id:, token:, environment:, path:, name:)
    query = URI.encode_www_form(
      "projectId" => project_id, "environment" => environment, "path" => path, "recursive" => "false"
    )
    url = "#{INFISICAL_API_BASE_URL}/api/v2/folders?#{query}"
    reconcile_infisical_folder_state(
      name: name,
      list_folders: -> { request_json(url, headers: _infisical_headers(token))["folders"] },
      create_folder: lambda {
        request_json(
          "#{INFISICAL_API_BASE_URL}/api/v2/folders",
          method: "POST",
          headers: _infisical_headers(token),
          body: { "projectId" => project_id, "environment" => environment, "path" => path, "name" => name },
          accepted_statuses: [200, 201]
        )
      }
    )
  end

  def ensure_bootstrap_folders(project_id, infisical_token)
    ENVIRONMENTS.each do |environment|
      _infisical_ensure_folder(
        project_id: project_id, token: infisical_token, environment: environment, path: "/", name: "opentofu"
      )
      _infisical_ensure_folder(
        project_id: project_id, token: infisical_token, environment: environment, path: "/opentofu", name: "bootstrap"
      )
    end
  end

  def apply_generated_folders(infisical_project_id, infisical_token)
    root = File.join(REPO_ROOT, "infrastructure/opentofu/roots/infisical-generated-folders")
    ENVIRONMENTS.each do |environment|
      access_key_id = get_bootstrap_secret(
        project_id: infisical_project_id, token: infisical_token, environment: environment, name: "R2_STATE_ACCESS_KEY_ID"
      )
      secret_access_key = get_bootstrap_secret(
        project_id: infisical_project_id, token: infisical_token, environment: environment, name: "R2_STATE_SECRET_ACCESS_KEY"
      )
      if access_key_id.nil? || access_key_id.empty? || secret_access_key.nil? || secret_access_key.empty?
        raise "Missing #{environment} R2 backend credentials before generated-folder reconciliation."
      end

      environment_variables = ENV.to_h.merge(
        "AWS_ACCESS_KEY_ID" => access_key_id,
        "AWS_SECRET_ACCESS_KEY" => secret_access_key,
        "INFISICAL_TOKEN" => infisical_token,
        "TF_IN_AUTOMATION" => "1"
      )
      environment_variables.delete("INFISICAL_AUTH_JWT")
      environment_variables.delete("INFISICAL_AUTH_METHOD")
      environment_variables.delete("INFISICAL_MACHINE_IDENTITY_ID")

      run_async(
        "tofu",
        [
          "init", "-reconfigure", "-input=false", "-backend-config=../../backends/r2.s3.tfbackend",
          "-backend-config=../../environments/#{environment}/infisical-generated-folders.s3.tfbackend"
        ],
        cwd: root, env: environment_variables
      )
      plan_path = File.join(
        Dir.tmpdir, "cataqui-bootstrap-infisical-generated-folders-#{environment}-#{SecureRandom.uuid}.tfplan"
      )
      begin
        run_async(
          "tofu", ["plan", "-input=false", "-lock-timeout=5m", "-var=environment=#{environment}", "-out", plan_path],
          cwd: root, env: environment_variables
        )
        run_async("tofu", ["apply", "-input=false", "-lock-timeout=5m", plan_path], cwd: root, env: environment_variables)
      ensure
        begin
          File.unlink(plan_path)
        rescue Errno::ENOENT
          # OpenTofu may fail before writing its plan; other cleanup failures must remain visible.
          nil
        end
      end
    end
  end

  def _infisical_list_identity_privileges(url, headers:)
    payload = request_json(url, headers: headers)
    privileges = payload["privileges"]
    return payload unless privileges.is_a?(Array)

    payload.merge("privileges" => privileges.map do |privilege|
      request_json(
        "#{INFISICAL_API_BASE_URL}/api/v2/identity-project-additional-privilege/#{privilege.fetch('id')}",
        headers: headers
      ).fetch("privilege")
    end)
  end

  def reconcile_infisical_identity(manifest:, project_id:, infisical_token:, environment:, github_oidc_subject_prefix:)
    name = manifest.fetch("infisical").fetch("opentofu_identities").fetch("cataqui_backend_#{environment}")
    environment_condition = { "$eq" => environment }
    permissions = [
      {
        "subject" => "secrets", "action" => ["describeSecret", "readValue"],
        "conditions" => { "environment" => environment_condition, "secretPath" => { "$eq" => BOOTSTRAP_SECRET_PATH } }
      },
      {
        "subject" => "secrets", "action" => ["describeSecret", "readValue", "create", "edit"],
        "conditions" => { "environment" => environment_condition, "secretPath" => { "$glob" => "/generated/**" } }
      },
      {
        "subject" => "secret-folders", "action" => ["read", "create"],
        "conditions" => { "environment" => environment_condition, "secretPath" => { "$eq" => "/" } }
      },
      {
        "subject" => "secret-folders", "action" => ["read", "create", "edit"],
        "conditions" => { "environment" => environment_condition, "secretPath" => { "$glob" => "/generated{,/**}" } }
      }
    ]
    expected_subject = "#{github_oidc_subject_prefix}:environment:#{environment}"
    privilege_slug = "opentofu-#{environment}"
    headers = _infisical_headers(infisical_token)
    search = URI.encode_www_form("search" => name, "limit" => "100", "offset" => "0")
    listed = request_json("#{INFISICAL_API_BASE_URL}/api/v1/projects/#{project_id}/identities?#{search}", headers: headers)
    raise "Infisical returned an invalid identity inventory." unless listed["identities"].is_a?(Array)

    identity = resolve_unique_named_resource(resources: listed["identities"], expected_name: name)
    unless identity
      begin
        created = request_json(
          "#{INFISICAL_API_BASE_URL}/api/v1/projects/#{project_id}/identities",
          method: "POST", headers: headers,
          body: { "name" => name, "hasDeleteProtection" => true, "metadata" => [] }, accepted_statuses: [200, 201]
        )
      rescue StandardError => error
        raise explain_infisical_identity_creation_failure(error: error, environment: environment)
      end
      identity = created["identity"]
    end
    identity_id = identity.fetch("id")
    oidc_url = "#{INFISICAL_API_BASE_URL}/api/v1/auth/oidc-auth/identities/#{identity_id}"
    existing_oidc = http_request(oidc_url, headers: { "accept" => "application/json" }.merge(headers))
    begin
      existing_oidc_payload = JSON.parse(existing_oidc.body)
    rescue JSON::ParserError
      existing_oidc_payload = nil
    end
    begin
      oidc_inspection = classify_infisical_oidc_inspection(status: existing_oidc.code.to_i, payload: existing_oidc_payload)
    rescue StandardError
      raise "Unable to inspect Infisical OIDC trust for #{environment} (#{existing_oidc.code.to_i})."
    end
    existing_oidc_configuration = nil
    if oidc_inspection == "present"
      existing_oidc_configuration = existing_oidc_payload.fetch("identityOidcAuth")
      if existing_oidc_configuration["boundSubject"] != expected_subject ||
         existing_oidc_configuration["boundIssuer"] != "https://token.actions.githubusercontent.com"
        raise "Foreign Infisical OIDC trust conflicts with #{name}."
      end
    end

    membership_url = "#{INFISICAL_API_BASE_URL}/api/v1/projects/#{project_id}/memberships/identities/#{identity_id}"
    membership = request_json(membership_url, headers: headers)["identityMembership"]
    roles = membership["roles"]
    privilege_query = URI.encode_www_form(
      "identityId" => identity_id, "projectId" => project_id
    )
    privilege_url = "#{INFISICAL_API_BASE_URL}/api/v2/identity-project-additional-privilege?#{privilege_query}"
    privilege_list = _infisical_list_identity_privileges(privilege_url, headers: headers)
    raise "Infisical returned an invalid privilege inventory." unless privilege_list["privileges"].is_a?(Array)
    if privilege_list["privileges"].any? { |candidate| candidate["slug"] != privilege_slug }
      raise "Infisical identity #{name} has privileges not owned by bootstrap."
    end

    privilege = resolve_infisical_privilege(privileges: privilege_list["privileges"], privilege_slug: privilege_slug)
    # Establish both OIDC and privilege ownership before repairing any mutable
    # identity or membership field on an existing same-named identity.
    unless identity["hasDeleteProtection"]
      request_json(
        "#{INFISICAL_API_BASE_URL}/api/v1/projects/#{project_id}/identities/#{identity_id}",
        method: "PATCH", headers: headers,
        body: {
          "name" => name, "hasDeleteProtection" => true,
          "metadata" => (identity["metadata"] || []).map { |item| { "key" => item["key"], "value" => item["value"] } }
        },
        accepted_statuses: [200]
      )
    end
    if !roles.is_a?(Array) || roles.length != 1 || roles[0]["role"] != "no-access" || roles[0]["isTemporary"]
      request_json(
        membership_url, method: "PATCH", headers: headers,
        body: { "roles" => [{ "role" => "no-access", "isTemporary" => false }] }, accepted_statuses: [200]
      )
    end
    unless privilege
      begin
        request_json(
          "#{INFISICAL_API_BASE_URL}/api/v2/identity-project-additional-privilege",
          method: "POST", headers: headers,
          body: {
            "identityId" => identity_id, "projectId" => project_id, "slug" => privilege_slug,
            "permissions" => permissions, "type" => { "isTemporary" => false }
          },
          accepted_statuses: [200, 201]
        )
      rescue StandardError => error
        raise unless is_infisical_privilege_already_present(error: error, privilege_slug: privilege_slug)

        refreshed = _infisical_list_identity_privileges(privilege_url, headers: headers)
        raise "Infisical returned an invalid privilege inventory." unless refreshed["privileges"].is_a?(Array)

        privilege = resolve_infisical_privilege(privileges: refreshed["privileges"], privilege_slug: privilege_slug)
        raise error unless privilege
      end
    end
    if privilege && (privilege["isTemporary"] ||
       _infisical_stable_json(_infisical_normalize_permissions(privilege["permissions"])) !=
       _infisical_stable_json(_infisical_normalize_permissions(permissions)))
      request_json(
        "#{INFISICAL_API_BASE_URL}/api/v2/identity-project-additional-privilege/#{privilege.fetch("id")}",
        method: "PATCH", headers: headers,
        body: { "slug" => privilege_slug, "permissions" => permissions, "type" => { "isTemporary" => false } },
        accepted_statuses: [200, 201]
      )
    end

    desired_oidc = {
      "oidcDiscoveryUrl" => "https://token.actions.githubusercontent.com",
      "boundIssuer" => "https://token.actions.githubusercontent.com",
      "boundAudiences" => "https://github.com/Cataqui",
      "boundSubject" => expected_subject,
      "boundClaims" => {},
      "accessTokenTrustedIps" => [{ "ipAddress" => "0.0.0.0/0" }, { "ipAddress" => "::/0" }],
      "accessTokenTTL" => 3600,
      "accessTokenMaxTTL" => 3600,
      "accessTokenNumUsesLimit" => 0
    }
    if oidc_inspection == "missing" || !_infisical_oidc_matches(configuration: existing_oidc_configuration, desired: desired_oidc)
      request_json(
        oidc_url, method: oidc_inspection == "missing" ? "POST" : "PATCH", headers: headers,
        body: desired_oidc, accepted_statuses: [200, 201]
      )
    end
    verified_oidc = request_json(oidc_url, headers: headers)["identityOidcAuth"]
    unless _infisical_oidc_matches(configuration: verified_oidc, desired: desired_oidc)
      raise "Infisical OIDC verification failed for #{environment}."
    end

    verified_privileges = _infisical_list_identity_privileges(privilege_url, headers: headers)["privileges"]
    verified_privilege = verified_privileges.is_a?(Array) ? verified_privileges.first : nil
    if !verified_privileges.is_a?(Array) || verified_privileges.length != 1 ||
       verified_privilege["slug"] != privilege_slug || verified_privilege["isTemporary"] != false ||
       !verified_privilege["permissions"].is_a?(Array) ||
       _infisical_stable_json(_infisical_normalize_permissions(verified_privilege["permissions"])) !=
       _infisical_stable_json(_infisical_normalize_permissions(permissions))
      raise "Infisical privilege verification failed for #{environment}."
    end

    verified_membership = request_json(membership_url, headers: headers)["identityMembership"]
    verified_roles = verified_membership&.[]("roles")
    if !verified_roles.is_a?(Array) || verified_roles.length != 1 || verified_roles[0]["role"] != "no-access" ||
       verified_roles[0]["isTemporary"] != false
      raise "Infisical membership verification failed for #{environment}."
    end

    verified_identities = request_json(
      "#{INFISICAL_API_BASE_URL}/api/v1/projects/#{project_id}/identities?#{search}", headers: headers
    )["identities"]
    raise "Infisical returned an invalid identity inventory." unless verified_identities.is_a?(Array)

    verified_identity = resolve_unique_named_resource(resources: verified_identities, expected_name: name)
    if verified_identity&.[]("id") != identity_id || verified_identity["hasDeleteProtection"] != true
      raise "Infisical identity verification failed for #{environment}."
    end
    identity_id
  end
end
