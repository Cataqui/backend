# frozen_string_literal: true

module Bootstrap
  def self.parse_github_oidc_subject_prefix(repository:, payload:)
    expected_owner, expected_repository = repository.split("/")
    prefix = payload.is_a?(Hash) ? payload["sub_claim_prefix"] : nil
    match = prefix.is_a?(String) ? /\Arepo:([^\/@]+)@([1-9][0-9]*)\/([^\/@]+)@([1-9][0-9]*)\z/.match(prefix) : nil
    unless match && match[1] == expected_owner && match[3] == expected_repository
      raise "GitHub returned an invalid immutable OIDC subject prefix for #{repository}."
    end
    prefix
  end
end
