# frozen_string_literal: true

require "digest"
require "json"

module Cataqui
  module Mapshot
    module SourceIdentities
      #: (source: Hash[String, Object]) -> String
      def self.fingerprint(source:)
        release = source.fetch("release")
        Digest::SHA256.hexdigest(JSON.generate({
          "archive" => release.fetch("pmtiles").fetch("digest"),
          "references" => release.fetch("references").fetch("id"),
          "indexes" => source.fetch("prepared").fetch("sha256")
        }))
      end
    end
  end
end
