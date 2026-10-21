# frozen_string_literal: true

module Bootstrap
  def self.classify_credential_response(status:)
    return "accepted" if status >= 200 && status < 300
    return "rejected" if status == 401 || status == 403
    "indeterminate"
  end

  def self.decide_r2_credentials(token:, access_key_id:, secret_access_key:, probe_succeeded:)
    has_access_key_id = access_key_id.is_a?(String) && !access_key_id.empty?
    has_secret_access_key = secret_access_key.is_a?(String) && !secret_access_key.empty?
    return "create" if !token && !has_access_key_id && !has_secret_access_key
    return "replace" if !token || !has_access_key_id || !has_secret_access_key
    return "replace" if token["id"] != access_key_id || token["status"] != "active"
    probe_succeeded ? "reuse" : "replace"
  end

  def self.get_r2_token_name(manifest:, environment:)
    "#{manifest.dig("cloudflare", "r2", "buckets", "opentofu_state")}-#{environment}"
  end
end
