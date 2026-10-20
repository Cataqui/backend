# frozen_string_literal: true

require_relative "reconciliation"

module Bootstrap
  def self.decide_meta_app_secret(stored_by_environment:)
    missing_environments = ENVIRONMENTS.select { |environment| !stored_by_environment[environment] || stored_by_environment[environment].empty? }
    return { "action" => "prompt", "environments" => missing_environments } unless missing_environments.empty?
    if stored_by_environment["staging"] == stored_by_environment["production"]
      return { "action" => "replace-shared", "environments" => ENVIRONMENTS }
    end
    { "action" => "reuse", "environments" => [] }
  end

  def self.reconcile_meta_app_secret_state(stored_by_environment:, request_secret:, write_secret:)
    decision = decide_meta_app_secret(stored_by_environment: stored_by_environment)
    decision["environments"].each do |environment|
      value = request_secret.call(environment)
      unless value.is_a?(String) && !value.empty?
        raise "The #{environment} Meta app secret cannot be empty."
      end
      write_secret.call(environment, value)
    end
    decision
  end
end
