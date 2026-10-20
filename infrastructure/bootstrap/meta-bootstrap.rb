# frozen_string_literal: true

require_relative "bootstrap-runtime"
require_relative "infisical-bootstrap"
require_relative "meta-reconciliation"
require_relative "reconciliation"

module Bootstrap
  module_function

  META_RUNTIME_SECRET_PATH = "/generated/auth/runtime"

  def reconcile_meta_app_secret(infisical_project_id:, infisical_token:)
    stored_by_environment = ENVIRONMENTS.to_h do |environment|
      value = get_infisical_secret(project_id: infisical_project_id, token: infisical_token,
                                   environment: environment, secret_path: META_RUNTIME_SECRET_PATH,
                                   name: "META_APP_SECRET")
      KNOWN_SECRETS.add(value) if value && !value.empty?
      [environment, value]
    end
    reconcile_meta_app_secret_state(
      stored_by_environment: stored_by_environment,
      request_secret: lambda do |environment|
        prompt_hidden(
          title: "#{environment == 'staging' ? 'Staging' : 'Production'} Meta Auth credential",
          message: "Paste the #{environment} META_APP_SECRET",
          guidance: [
            "Open the #{environment} Meta app, then copy its App Secret from App settings > Basic.",
            "Auth uses it to verify WhatsApp request signatures.",
            "Bootstrap stores it only in the #{environment} environment at /generated/auth/runtime."
          ].join("\n"),
          unavailable_message: "#{environment} META_APP_SECRET is missing; rerun bootstrap from an interactive terminal."
        )
      end,
      write_secret: lambda do |environment, value|
        set_infisical_secret(project_id: infisical_project_id, token: infisical_token,
                             environment: environment, secret_path: META_RUNTIME_SECRET_PATH,
                             name: "META_APP_SECRET", value: value)
      end
    )
  end
end
