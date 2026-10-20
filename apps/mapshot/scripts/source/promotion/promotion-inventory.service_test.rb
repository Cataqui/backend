# frozen_string_literal: true

require_relative "../../../test/test_helper"
require_relative "promotion-inventory.service"

class PromotionInventoryServiceTest < Minitest::Test
  ID = "f" * 64

  class Storage
    attr_reader :objects, :reads, :writes, :heads
    attr_accessor :head_transform, :read_transform, :write_transform

    def initialize(objects:)
      @objects = objects
      @reads = []
      @writes = []
      @heads = []
      @_lock = Mutex.new
    end

    def head_object(key:, signal:, **)
      signal&.check!
      @_lock.synchronize { heads.push(key) }
      object = objects[key]
      value = if object
        {"kind" => "object", "bytes" => object.fetch("bytes").bytesize, "etag" => object.fetch("etag")}.tap do |result|
          result["sha256"] = object.fetch("sha256") if object.key?("sha256")
          result["contentType"] = object.fetch("contentType") if object.key?("contentType")
        end
      else
        {"kind" => "missing"}
      end
      head_transform ? head_transform.call(key: key, value: value) : value
    end

    def read_range(key:, offset:, length:, etag:, signal:, **)
      signal&.check!
      reads.push(key)
      object = objects.fetch(key)
      raise "Source changed during read." unless object.fetch("etag") == etag

      bytes = object.fetch("bytes").byteslice(offset, length)
      read_transform ? read_transform.call(key: key, bytes: bytes) : bytes
    end

    def put_raw(key:, bytes:, content_type:, signal:, **)
      signal&.check!
      existing = objects[key]
      raise "Immutable metadata changed." if existing && existing.fetch("bytes") != bytes

      sha256 = Digest::SHA256.hexdigest(bytes)
      objects[key] = {"bytes" => bytes.dup, "etag" => sha256, "sha256" => sha256, "contentType" => content_type}
      writes.push(key)
      write_transform&.call(key: key, object: objects.fetch(key))
      sha256
    end
  end

  class Domain
    attr_reader :validations
    attr_accessor :failure

    def initialize(files:)
      @_files = files
      @validations = []
    end

    def validate(kind:, value:)
      validations.push(kind)
      raise "Domain rejected #{kind}." if failure == kind

      # Shape/order follow fixtures from the authoritative Node schemas. This
      # fake is deliberately not a second implementation of runtime validation.
      if kind == "promotion-page"
        value.fetch("assets").each do |asset|
          checksum = asset.delete("sha256")
          content_type = asset.delete("contentType")
          asset["sha256"] = checksum if checksum
          asset["contentType"] = content_type
        end
      end
      if kind == "promotion-reference"
        return {"key" => value.fetch("key"), "sha256" => value.fetch("sha256"), "bytes" => value.fetch("bytes")}
      end

      value
    end

    def promotion_page_asset_limit
      100
    end

    def validate_index_manifest(value:)
      raise "Domain rejected index manifest." if failure == "index-manifest"

      {"manifest" => value, "files" => @_files}
    end
  end

  def test_builds_verified_unique_inventory_without_downloading_planet_or_landmarks
    setup = _setup
    reference = _build(setup: setup)
    assets = _assets(storage: setup.fetch(:storage), reference: reference)

    assert_equal "source/promotions/v1/#{ID}/assets.json", reference.fetch("key")
    assert_equal 5, assets.length
    assert_equal assets.map { |asset| asset.fetch("key") }.sort.uniq, (assets.map { |asset| asset.fetch("key") })
    archive_key = setup.fetch(:source).fetch("release").fetch("pmtiles").fetch("objectKey")
    landmarks_key = setup.fetch(:index).fetch("landmarks").fetch("key")
    refute_includes setup.fetch(:storage).reads, archive_key
    refute_includes setup.fetch(:storage).reads, landmarks_key
    assert_equal "application/octet-stream", assets.find { |asset| asset.fetch("key") == archive_key }.fetch("contentType")
    assert(assets.none? { |asset| asset.fetch("key").include?("obsolete") })
    assert_equal Digest::SHA256.hexdigest(setup.fetch(:storage).objects.fetch(reference.fetch("key")).fetch("bytes")), reference.fetch("sha256")
    assert_equal %w[promotion-page promotion-manifest promotion-reference], setup.fetch(:domain).validations
  end

  def test_splits_many_index_chunks_into_bounded_promotion_pages
    setup = _setup(directory_chunks: 205)
    reference = _build(setup: setup)
    root = _json(storage: setup.fetch(:storage), key: reference.fetch("key"))
    assert_equal [100, 100, 9], (root.fetch("pages").map { |page| _json(storage: setup.fetch(:storage), key: page.fetch("key")).fetch("assets").length })
    assert_equal 209, _assets(storage: setup.fetch(:storage), reference: reference).length
    assert_equal 3, setup.fetch(:domain).validations.count("promotion-page")
  end

  def test_rebuilds_same_snapshot_idempotently
    setup = _setup
    assert_equal _build(setup: setup), _build(setup: setup)
  end

  def test_honors_cancellation_before_storage_work
    setup = _setup
    signal = Object.new
    def signal.check! = raise("Cancelled.")

    assert_raises(RuntimeError) { _build(setup: setup, signal: signal) }
    assert_empty setup.fetch(:storage).heads
  end

  def test_rejects_missing_oversized_changed_and_short_read_metadata_before_root_publication
    %w[missing oversized hash short-read invalid-utf8 invalid-json domain].each do |failure|
      setup = _setup
      key = setup.fetch(:source).fetch("prepared").fetch("manifestKey")
      object = setup.fetch(:storage).objects.fetch(key)
      case failure
      when "missing" then setup.fetch(:storage).objects.delete(key)
      when "oversized" then object["bytes"] += "x"
      when "hash" then object["bytes"] = "x"
      when "short-read" then setup.fetch(:storage).read_transform = ->(bytes:, **) { bytes.byteslice(0, 1) }
      when "invalid-utf8", "invalid-json"
        object["bytes"] = failure == "invalid-utf8" ? "\xFF".b : "{"
        setup.fetch(:source).fetch("prepared")["bytes"] = object.fetch("bytes").bytesize
        setup.fetch(:source).fetch("prepared")["sha256"] = Digest::SHA256.hexdigest(object.fetch("bytes"))
      when "domain" then setup.fetch(:domain).failure = "index-manifest"
      end

      assert_raises(StandardError, failure) { _build(setup: setup) }
      refute setup.fetch(:storage).objects.key?("source/promotions/v1/#{ID}/assets.json"), failure
    end
  end

  def test_rejects_source_or_landmark_identity_mismatches
    %w[archive-bytes archive-id archive-algorithm landmark-key landmark-hash exact-metadata-size].each do |failure|
      setup = _setup
      release = setup.fetch(:source).fetch("release")
      case failure
      when "archive-bytes" then release.fetch("pmtiles")["bytes"] += 1
      when "archive-id" then release.fetch("pmtiles")["id"] = "0" * 64
      when "archive-algorithm" then release.fetch("pmtiles").fetch("digest")["algorithm"] = "sha256"
      when "landmark-key" then release.fetch("references")["catalogueKey"] = "source/other.pmtiles"
      when "landmark-hash" then release.fetch("references")["id"] = "0" * 64
      when "exact-metadata-size" then setup.fetch(:source).fetch("prepared")["bytes"] += 1
      end
      assert_raises(RuntimeError, failure) { _build(setup: setup) }
    end
  end

  def test_rejects_changed_asset_metadata
    %w[missing bytes etag sha256].each do |failure|
      setup = _setup
      key = setup.fetch(:index).fetch("landmarks").fetch("key")
      setup.fetch(:storage).head_transform = lambda do |key:, value:|
        next value unless key == setup.fetch(:index).fetch("landmarks").fetch("key")

        case failure
        when "missing" then {"kind" => "missing"}
        when "bytes" then value.merge("bytes" => value.fetch("bytes") + 1)
        when "etag" then value.merge("etag" => "changed")
        when "sha256" then value.merge("sha256" => "0" * 64)
        end
      end
      # Landmark ETags are selected by HEAD, so a valid changed ETag is accepted;
      # the pinned archive ETag is the one that must remain stable.
      if failure == "etag"
        setup.fetch(:source).fetch("release").fetch("pmtiles")["etag"] = "changed"
      end
      assert_raises(RuntimeError, failure) { _build(setup: setup) }
      refute setup.fetch(:storage).objects.key?("source/promotions/v1/#{ID}/assets.json"), key
    end
  end

  def test_rejects_conflicting_asset_keys
    setup = _setup
    setup.fetch(:source).fetch("release").fetch("pmtiles")["objectKey"] = setup.fetch(:index).fetch("landmarks").fetch("key")
    assert_raises(RuntimeError) { _build(setup: setup) }
  end

  def test_uses_verified_hash_when_optional_object_checksum_is_absent
    setup = _setup
    landmarks = setup.fetch(:index).fetch("landmarks")
    setup.fetch(:storage).objects.fetch(landmarks.fetch("key")).delete("sha256")
    reference = _build(setup: setup)
    asset = _assets(storage: setup.fetch(:storage), reference: reference).find { |item| item.fetch("key") == landmarks.fetch("key") }
    assert_equal landmarks.fetch("sha256"), asset.fetch("sha256")
  end

  def test_accepts_sdk_nil_for_an_absent_optional_object_checksum
    setup = _setup
    landmark_key = setup.fetch(:index).fetch("landmarks").fetch("key")
    setup.fetch(:storage).objects.fetch(landmark_key)["sha256"] = nil
    reference = _build(setup: setup)

    assert(_assets(storage: setup.fetch(:storage), reference: reference).any? { |asset| asset.fetch("key") == landmark_key })
  end

  def test_rejects_invalid_page_from_authoritative_schema_before_any_write
    setup = _setup
    setup.fetch(:domain).failure = "promotion-page"
    assert_raises(RuntimeError) { _build(setup: setup) }
    assert_empty setup.fetch(:storage).writes
  end

  def test_publishes_generated_descriptors_in_dependency_order_without_reading_them_back
    setup = _setup
    reference = _build(setup: setup)
    storage = setup.fetch(:storage)
    root = _json(storage: storage, key: reference.fetch("key"))
    descriptors = [*root.fetch("pages"), reference]

    assert_equal descriptors.map { |descriptor| descriptor.fetch("key") }, storage.writes
    descriptors.each do |descriptor|
      bytes = storage.objects.fetch(descriptor.fetch("key")).fetch("bytes")
      assert_equal bytes.bytesize, descriptor.fetch("bytes")
      assert_equal Digest::SHA256.hexdigest(bytes), descriptor.fetch("sha256")
    end
    assert_empty storage.writes & storage.heads
    assert_empty storage.writes & storage.reads
  end

  def test_stops_publishing_when_metadata_write_fails
    setup = _setup
    setup.fetch(:storage).write_transform = ->(**) { raise "Storage unavailable." }
    assert_raises(RuntimeError) { _build(setup: setup) }
    refute setup.fetch(:storage).objects.key?("source/promotions/v1/#{ID}/assets.json")
  end

  def test_joins_all_bounded_head_outcomes_before_failing
    setup = _setup(directory_chunks: 10)
    setup.fetch(:storage).head_transform = lambda do |key:, value:|
      raise "Storage unavailable." if key == setup.fetch(:source).fetch("release").fetch("pmtiles").fetch("objectKey")

      value
    end
    assert_raises(RuntimeError) { _build(setup: setup) }
    assert_operator setup.fetch(:storage).heads.length, :>=, 9
  end

  private

  def _setup(directory_chunks: 1)
    planet = "planet" * 40
    archive_id = Digest::SHA256.hexdigest(planet)
    landmarks = "landmarks" * 20
    landmarks_sha = Digest::SHA256.hexdigest(landmarks)
    landmark_key = "source/import/attempts/a/b/references/landmarks.pmtiles"
    objects = {
      "source/slots/a/planet.pmtiles" => {"bytes" => planet, "etag" => "planet-etag"},
      landmark_key => {"bytes" => landmarks, "etag" => "landmark-etag", "sha256" => landmarks_sha},
      "source/references/obsolete.json" => {"bytes" => "obsolete", "etag" => "obsolete"}
    }
    files = ["header" * 30, *Array.new(directory_chunks) { |index| [index].pack("N") }].map do |bytes|
      hash = Digest::SHA256.hexdigest(bytes)
      path = "files/#{hash}.body"
      objects["source/indexes/v1/#{path}"] = {"bytes" => bytes, "etag" => hash, "sha256" => hash, "contentType" => "application/octet-stream"}
      {"path" => path, "bytes" => bytes.bytesize, "sha256" => hash}
    end
    index = {
      "archive" => {"id" => archive_id, "bytes" => planet.bytesize, "digest" => {"algorithm" => "blake3"}},
      "landmarks" => {"key" => landmark_key, "bytes" => landmarks.bytesize, "sha256" => landmarks_sha}
    }
    index_bytes = JSON.generate(index)
    sha256 = Digest::SHA256.hexdigest(index_bytes)
    manifest_key = "source/indexes/v1/#{archive_id}/#{sha256}/manifest.json"
    objects[manifest_key] = {"bytes" => index_bytes, "etag" => sha256, "sha256" => sha256, "contentType" => "application/json"}
    source = {
      "release" => {"pmtiles" => {"id" => archive_id, "bytes" => planet.bytesize, "digest" => {"algorithm" => "blake3"},
                                  "objectKey" => "source/slots/a/planet.pmtiles", "etag" => "planet-etag"},
                    "references" => {"id" => landmarks_sha, "catalogueKey" => landmark_key}},
      "prepared" => {"manifestKey" => manifest_key, "bytes" => index_bytes.bytesize, "sha256" => sha256}
    }
    {storage: Storage.new(objects: objects), source: source, index: index, domain: Domain.new(files: files)}
  end

  def _repository(setup:)
    Cataqui::Mapshot::PromotionInventoryService.new(source: setup.fetch(:storage), destination: setup.fetch(:storage), domain: setup.fetch(:domain))
  end

  def _build(setup:, signal: nil)
    _repository(setup: setup).build(id: ID, source: setup.fetch(:source), signal: signal)
  end

  def _json(storage:, key:)
    JSON.parse(storage.objects.fetch(key).fetch("bytes"))
  end

  def _assets(storage:, reference:)
    _json(storage: storage, key: reference.fetch("key")).fetch("pages").flat_map do |page|
      _json(storage: storage, key: page.fetch("key")).fetch("assets")
    end
  end
end
