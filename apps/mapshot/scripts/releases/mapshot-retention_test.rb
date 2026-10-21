# frozen_string_literal: true

require_relative "../../test/test_helper"
require_relative "mapshot-retention"

class MapshotRetentionTest < Minitest::Test
  class State
    attr_accessor :value

    def read
      { "value" => @value }
    end
  end

  class Domain
    def validate(kind:, value:)
      raise "Unexpected contract" unless kind == "index-manifest"

      value
    end
  end

  class Storage
    attr_reader :objects, :deleted, :listed
    attr_accessor :pages

    def initialize
      @objects = {}
      @deleted = []
      @listed = []
    end

    def head_object(key:, **)
      @objects.fetch(key, { "kind" => "missing" })
    end

    def read_range(key:, etag:, offset:, length:, **)
      raise "unexpected range" unless etag == "metadata" && offset.zero? && length == @objects.fetch(key).fetch("bytes")

      @objects.fetch(key).fetch("body")
    end

    def list_page(prefix:, cursor:, **)
      @listed.push({ prefix: prefix, cursor: cursor })
      return @pages.call(prefix: prefix, cursor: cursor) if @pages

      { "objects" => @objects.keys.select { |key| key.start_with?(prefix) }.map { |key| { "key" => key } }, "cursor" => nil }
    end

    def delete(keys:, **)
      @deleted.concat(keys)
    end
  end

  def setup
    @state = State.new
    @storage = Storage.new
    @indexes = { "archive" => { "id" => "archive-id" }, "landmarks" => { "sha256" => "landmarks-id", "key" => "source/import/attempts/current/references/catalogue" }, "metadata" => { "headerRoot" => { "path" => "root" }, "leaves" => [{ "file" => { "path" => "leaf" } }] } }
    source = { "release" => { "pmtiles" => { "id" => "archive-id", "objectKey" => "source/slots/a/planet.pmtiles" }, "references" => { "id" => "landmarks-id", "catalogueKey" => @indexes.dig("landmarks", "key") } }, "prepared" => { "manifestKey" => "source/indexes/v1/manifest", "sha256" => "pending" } }
    active = { "source" => source, "artifact" => { "key" => "deployments/artifacts/active" } }
    previous = active.merge("artifact" => { "key" => "deployments/artifacts/previous" })
    @state.value = { "active" => active, "previous" => previous, "pending" => nil }
    _encode
    %w[deployments/artifacts/active deployments/artifacts/previous deployments/artifacts/old source/indexes/v1/root source/indexes/v1/leaf source/indexes/v1/old source/import/attempts/old/references/unpublished].push(@indexes.dig("landmarks", "key")).each do |key|
      @storage.objects[key] = { "kind" => "object", "bytes" => 1, "etag" => "unused" }
    end
    @service = Cataqui::Mapshot::Retention.new(state: @state, storage: @storage, data: Domain.new)
  end

  def test_actual_successful_pair_and_transitive_indexes_survive_cleanup
    @service.clean
    assert_equal %w[deployments/artifacts/old source/import/attempts/old/references/unpublished source/indexes/v1/old], @storage.deleted.sort
    assert_equal(%w[source/import/attempts/ source/indexes/v1/ deployments/artifacts/], @storage.listed.map { |entry| entry.fetch(:prefix) })
  end

  def test_no_previous_deployment_still_preserves_active_data
    @state.value["previous"] = nil
    @service.clean
    assert_includes @storage.deleted, "deployments/artifacts/previous"
    refute_includes @storage.deleted, "deployments/artifacts/active"
    refute_includes @storage.deleted, "source/indexes/v1/manifest"
  end

  def test_pending_or_absent_active_deployment_blocks_cleanup
    @state.value["pending"] = { "stage" => "preparing" }
    assert_match(/completed/, assert_raises(RuntimeError) { @service.clean }.message)
    @state.value["pending"] = nil
    @state.value["active"] = nil
    assert_match(/completed/, assert_raises(RuntimeError) { @service.clean }.message)
    assert_empty @storage.deleted
  end

  def test_missing_retained_metadata_blocks_cleanup
    @storage.objects.delete("source/indexes/v1/manifest")
    assert_match(/missing/, assert_raises(RuntimeError) { @service.clean }.message)
    assert_empty @storage.deleted
  end

  def test_retains_transitive_indexes_from_a_valid_manifest_larger_than_eight_mebibytes
    body = JSON.generate(@indexes) + ("\n" * (8 * 1024 * 1024))
    @storage.objects.fetch("source/indexes/v1/manifest").merge!("body" => body, "bytes" => body.bytesize)
    @state.value.fetch("active").fetch("source").fetch("prepared")["sha256"] = Digest::SHA256.hexdigest(body)

    @service.clean

    assert_includes @storage.deleted, "source/indexes/v1/old"
    refute_includes @storage.deleted, "source/indexes/v1/root"
    refute_includes @storage.deleted, "source/indexes/v1/leaf"
    refute_includes @storage.deleted, @indexes.dig("landmarks", "key")
  end

  def test_corrupt_retained_metadata_blocks_cleanup
    @storage.objects.fetch("source/indexes/v1/manifest")["body"] = "corrupt"
    assert_match(/verification/, assert_raises(RuntimeError) { @service.clean }.message)
    assert_empty @storage.deleted
  end

  def test_landmark_and_archive_identity_mismatches_block_cleanup
    [["archive", "id"], ["landmarks", "sha256"], ["landmarks", "key"]].each do |outer, inner|
      setup
      @indexes.fetch(outer)[inner] = "wrong"
      _encode
      assert_match(/does not match/, assert_raises(RuntimeError) { @service.clean }.message)
      assert_empty @storage.deleted
    end
  end

  def test_storage_inventory_failure_prevents_cleanup
    failure = IOError.new("Storage inventory failed.")
    @storage.pages = ->(**) { raise failure }
    assert_same failure, assert_raises(IOError) { @service.clean }
    assert_empty @storage.deleted
  end

  def test_repeated_cursor_does_not_loop_forever
    @storage.pages = ->(**) { { "objects" => [], "cursor" => "same" } }
    assert_match(/repeated/, assert_raises(RuntimeError) { @service.clean }.message)
    assert_equal 2, @storage.listed.length
  end

  def test_multiple_cleanup_pages_continue_and_empty_removals_skip_delete
    @storage.pages = lambda do |prefix:, cursor:|
      if cursor.nil?
        { "objects" => [], "cursor" => "next" }
      else
        { "objects" => [{ "key" => "#{prefix}old-other" }], "cursor" => nil }
      end
    end
    @service.clean
    assert_equal 6, @storage.listed.length
    assert_equal 3, @storage.deleted.length
  end

  private

  def _encode
    body = JSON.generate(@indexes)
    @storage.objects["source/indexes/v1/manifest"] = { "kind" => "object", "body" => body, "bytes" => body.bytesize, "etag" => "metadata" }
    @state.value.fetch("active").fetch("source").fetch("prepared")["sha256"] = Digest::SHA256.hexdigest(body)
  end
end
