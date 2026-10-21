# frozen_string_literal: true

require "json"
require "open3"

# This narrow adapter exposes the application's authoritative data contracts to
# Ruby without reproducing their schemas or loading runtime services.
class MapshotBuildData
  class InvalidData < StandardError; end

  #: (?application_root: String) -> void
  def initialize(application_root: File.expand_path("..", __dir__))
    @_application_root = application_root
  end

  #: (kind: String, value: Hash[String, Object]) -> Hash[String, Object]
  def validate(kind:, value:)
    script = File.join(@_application_root, "dist/tools/build-data.mjs")
    output, _error, status = Open3.capture3("node", script, kind, stdin_data: JSON.generate(value), binmode: true)
    raise InvalidData, "Mapshot build data validation failed." unless status.success?

    JSON.parse(output.force_encoding(Encoding::UTF_8))
  rescue JSON::ParserError, SystemCallError
    raise InvalidData, "Mapshot build data validation failed."
  end
end
