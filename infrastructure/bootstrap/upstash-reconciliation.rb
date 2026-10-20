# frozen_string_literal: true

require_relative "reconciliation"

module Bootstrap
  def self._get_stored_upstash_key(stored_by_environment:)
    staging_key = stored_by_environment["staging"]
    production_key = stored_by_environment["production"]
    if staging_key && !staging_key.empty? && production_key && !production_key.empty? && !constant_time_equal(left: staging_key, right: production_key)
      raise "Staging and production contain different Upstash bootstrap API keys."
    end
    staging_key || production_key
  end

  def self.classify_upstash_credential_response(status:)
    return "accepted" if status >= 200 && status < 300
    return "rejected" if status == 401 || status == 403
    "indeterminate"
  end

  def self.decide_upstash_credential(stored_by_environment:, credential_status:)
    stored_key = _get_stored_upstash_key(stored_by_environment: stored_by_environment)
    return { "action" => "request", "writeEnvironments" => ENVIRONMENTS.dup } if !stored_key || stored_key.empty?
    if credential_status == "accepted"
      return { "action" => "reuse", "writeEnvironments" => ENVIRONMENTS.select { |environment| !stored_by_environment[environment] || stored_by_environment[environment].empty? } }
    end
    return { "action" => "replace", "writeEnvironments" => ENVIRONMENTS.dup } if credential_status == "rejected"
    raise "Unable to determine whether the stored Upstash bootstrap API key is valid."
  end

  def self.reconcile_upstash_credential(stored_by_environment:, verify_key:, request_key:, write_key:)
    stored_key = _get_stored_upstash_key(stored_by_environment: stored_by_environment)
    credential_status = stored_key && !stored_key.empty? ? verify_key.call(stored_key) : "missing"
    decision = decide_upstash_credential(stored_by_environment: stored_by_environment, credential_status: credential_status)
    selected_key = stored_key
    if decision["action"] == "request" || decision["action"] == "replace"
      selected_key = request_key.call
      raise "The supplied Upstash bootstrap API key is empty." if !selected_key || selected_key.empty?
      supplied_status = verify_key.call(selected_key)
      raise "The supplied Upstash bootstrap API key is invalid." if supplied_status == "rejected"
      raise "Unable to verify the supplied Upstash bootstrap API key." if supplied_status != "accepted"
    end
    decision["writeEnvironments"].each { |environment| write_key.call(environment, selected_key) }
    { "action" => decision["action"], "writtenEnvironments" => decision["writeEnvironments"] }
  end

  private_class_method :_get_stored_upstash_key
end
