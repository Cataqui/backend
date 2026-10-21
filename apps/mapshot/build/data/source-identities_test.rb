# frozen_string_literal: true

require_relative "../../test/test_helper"
require "json"
require_relative "source-identities"

class MapshotSourceIdentitiesTest < Minitest::Test
  #: () -> void
  def test_preserves_the_existing_content_fingerprint
    fixture = _fixture
    assert_equal fixture.fetch("expected").fetch("fingerprint"),
      Cataqui::Mapshot::SourceIdentities.fingerprint(source: fixture.fetch("candidate"))
  end

  #: () -> void
  def test_reuses_the_content_fingerprint_when_transport_addresses_change
    fixture = _fixture
    source = fixture.fetch("candidate")
    release = source.fetch("release")
    release.fetch("pmtiles")["objectKey"] = "source/slots/b/planet.pmtiles"
    release.fetch("pmtiles")["etag"] = "copied-etag"
    release.fetch("references")["catalogueKey"] = "source/promoted/catalogue.json"
    source.fetch("prepared")["manifestKey"] = "source/indexes/v1/#{'b' * 64}/#{'e' * 64}/manifest.json"

    assert_equal fixture.fetch("expected").fetch("fingerprint"),
      Cataqui::Mapshot::SourceIdentities.fingerprint(source: source)
  end

  #: () -> void
  def test_changes_the_content_fingerprint_when_an_owned_dataset_component_changes
    [
      %w[release pmtiles digest value],
      %w[release references id],
      %w[prepared sha256]
    ].each do |path|
      fixture = _fixture
      source = fixture.fetch("candidate")
      source.dig(*path[0...-1])[path.last] = "f" * 64

      refute_equal fixture.fetch("expected").fetch("fingerprint"),
        Cataqui::Mapshot::SourceIdentities.fingerprint(source: source), path.join(".")
    end
  end

  private

  #: () -> Hash[String, Object]
  def _fixture
    JSON.parse(File.read(File.join(__dir__, "fixtures/source-identities.json"), encoding: "UTF-8"))
  end
end
