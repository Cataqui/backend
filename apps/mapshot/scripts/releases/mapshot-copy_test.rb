# frozen_string_literal: true

require_relative "../../test/test_helper"
require_relative "mapshot-copy"
require_relative "../source/import/source-import.error"
require "timeout"

class MapshotCopyTest < Minitest::Test
  class Domain
    attr_reader :releases

    def initialize
      @releases = []
    end

    def validate(kind:, value:)
      raise "Unexpected contract #{kind}" unless %w[copy-checkpoint promotion-manifest promotion-page source-release].include?(kind)

      @releases.push(value) if kind == "source-release"
      value
    end
  end

  class Storage
    attr_accessor :asset, :write_conflict, :part_error, :part_etag, :completion_error, :completion_bytes, :completion_etag, :source_change_at, :clock
    attr_reader :objects, :documents, :parts, :reads, :heads, :completions, :puts

    def initialize
      @objects = {}
      @documents = {}
      @parts = []
      @reads = []
      @heads = []
      @completions = []
      @puts = []
    end

    def read_document(key:, **)
      @documents[key] ? Marshal.load(Marshal.dump(@documents[key])) : { "kind" => "missing" }
    end

    def write_document(key:, value:, expected_etag:, **)
      return { "kind" => "conflict" } if @write_conflict || @documents.dig(key, "etag") != expected_etag

      etag = (@documents.dig(key, "etag").to_i + 1).to_s
      @documents[key] = { "kind" => "document", "value" => Marshal.load(Marshal.dump(value)), "etag" => etag }
      { "kind" => "written", "etag" => etag }
    end

    def head_object(key:, **)
      @heads.push(key)
      if key == @asset.fetch("key")
        return { "kind" => "missing" } if @source_change_at == @heads.length

        return { "kind" => "object", "etag" => @asset.fetch("etag"), "bytes" => @asset.fetch("bytes") }
      end
      @objects.fetch(key, { "kind" => "missing" })
    end

    def read_range(key:, offset:, length:, etag:, **)
      @reads.push({ key: key, offset: offset, length: length, etag: etag })
      key == @asset.fetch("key") ? "x" * length : @objects.fetch(key).fetch("body").byteslice(offset, length)
    end

    def put_raw(key:, bytes:, content_type:, **)
      @puts.push({ key: key, bytes: bytes, content_type: content_type })
      "copied-etag"
    end

    def create_multipart(key:, **)
      { "kind" => "multipart", "uploadId" => "upload-#{key}" }
    end

    def copy_part(key:, source_bucket:, source_key:, upload_id:, part_number:, offset:, length:, **)
      @parts.push({ key: key, source_bucket: source_bucket, source_key: source_key, upload_id: upload_id, part_number: part_number, offset: offset, length: length })
      raise "temporary copy failure" if @part_error == part_number

      @part_etag || Digest::MD5.hexdigest(offset.to_s)
    end

    def complete_multipart(key:, upload_id:, parts:, **)
      @completions.push({ key: key, upload_id: upload_id, parts: parts })
      etag = @completion_etag || "#{Digest::MD5.hexdigest(parts.map { |part| [part.fetch('etag')].pack('H*') }.join)}-#{parts.length}"
      object = { "kind" => "object", "etag" => etag, "bytes" => @completion_bytes || @asset.fetch("bytes") }
      @objects[key] = object
      raise "lost completion reply" if @completion_error

      object
    end

    def encode(key:, value:)
      body = JSON.generate(value)
      @objects[key] = { "kind" => "object", "body" => body, "bytes" => body.bytesize, "etag" => "metadata" }
      { "key" => key, "bytes" => body.bytesize, "sha256" => Digest::SHA256.hexdigest(body) }
    end
  end

  def setup
    @storage = Storage.new
    @data = Domain.new
    @time = 0
    @service = Cataqui::Mapshot::Copy.new(source: @storage, source_bucket: "staging", destination: @storage, data: @data, clock: -> { @time })
    @source = {
      "release" => {
        "schemaVersion" => 1,
        "pmtiles" => { "id" => "archive", "objectKey" => "source/slots/a/planet.pmtiles", "bytes" => 1000, "etag" => "source-etag", "digest" => "digest", "minZoom" => 0, "maxZoom" => 14, "coverage" => "world" },
        "references" => { "id" => "references", "catalogueKey" => "catalogue" }
      },
      "prepared" => { "manifestKey" => "indexes", "sha256" => "index-digest" }
    }
    _inventory
  end

  def test_small_archive_uses_selected_slot_and_resumes_without_recopying
    result = _copy
    assert_equal "source/slots/b/planet.pmtiles", result.dig("release", "pmtiles", "objectKey")
    assert_equal "copied-etag", result.dig("release", "pmtiles", "etag")
    assert_equal @source.fetch("prepared"), result.fetch("prepared")
    assert_equal 1, @storage.puts.length
    assert_equal result, _copy
    assert_equal 1, @storage.puts.length
    assert_equal result.fetch("release"), @data.releases.last
  end

  def test_expired_copy_saves_continuation_then_resumes
    assert_nil _copy(deadline_at: 0)
    assert_empty @storage.puts
    refute_nil _copy
  end

  #: () -> void
  def test_interrupted_copy_resumes_at_the_next_page_without_recopying_completed_assets
    index = @storage.encode(key: "index", value: { "index" => true })
    index_asset = index.merge("etag" => "metadata", "contentType" => "application/json")
    first_page = @storage.encode(key: "first-page", value: { "version" => 1, "assets" => [@storage.asset] })
    second_page = @storage.encode(key: "second-page", value: { "version" => 1, "assets" => [index_asset] })
    @inventory = @storage.encode(key: "inventory", value: { "version" => 1, "pages" => [first_page, second_page] })
    calls = 0
    service = Cataqui::Mapshot::Copy.new(source: @storage, source_bucket: "staging", destination: @storage, data: @data, clock: -> { calls += 1; calls == 1 ? 0 : 100 })

    assert_nil service.copy(**_input, deadline_at: 50)
    checkpoint = @storage.documents.fetch("source/slots/b/copy.json").fetch("value")
    assert_equal 1, checkpoint.fetch("page")
    assert_equal 0, checkpoint.fetch("asset")
    assert_equal ["source/slots/b/planet.pmtiles"], (@storage.puts.map { |put| put.fetch(:key) })

    refute_nil _copy
    assert_equal ["source/slots/b/planet.pmtiles", "index"], (@storage.puts.map { |put| put.fetch(:key) })
  end

  def test_changed_operation_discards_old_checkpoint
    _copy
    _copy(operation: "a" * 64)
    assert_equal 2, @storage.puts.length
  end

  def test_small_asset_integrity_failure_prevents_publication
    @storage.asset["sha256"] = "invalid"
    _inventory(asset: @storage.asset)
    assert_match(/integrity/, assert_raises(RuntimeError) { _copy }.message)
    assert_empty @storage.puts
  end

  def test_checkpoint_conflicts_are_not_overwritten
    @storage.write_conflict = true
    assert_match(/checkpoint/, assert_raises(RuntimeError) { _copy }.message)
  end

  def test_large_planet_uses_bounded_server_side_parts_and_no_download
    _large
    refute_nil _copy
    parts = @storage.parts.sort_by { |part| part.fetch(:part_number) }
    assert_equal([256 * 1024 * 1024, 1024 * 1024], parts.map { |part| part.fetch(:length) })
    assert_equal([0, 256 * 1024 * 1024], parts.map { |part| part.fetch(:offset) })
    assert_equal([1, 2], parts.map { |part| part.fetch(:part_number) })
    assert(@storage.parts.all? { |part| part.fetch(:source_bucket) == "staging" })
    assert_empty(@storage.reads.select { |read| read.fetch(:key) == @storage.asset.fetch("key") })
    assert_equal 2, @storage.heads.count(@storage.asset.fetch("key"))
  end

  def test_lost_multipart_completion_reply_is_reconciled_without_recopy
    _large
    @storage.completion_error = true
    assert_match(/lost completion/, assert_raises(RuntimeError) { _copy }.message)
    @storage.completion_error = false
    refute_nil _copy
    assert_equal 1, @storage.completions.length
    assert_equal 2, @storage.parts.length
  end

  def test_interrupted_copy_resumes_after_durable_part_receipt
    _large
    @storage.part_error = 2
    assert_raises(RuntimeError) { _copy }
    assert_equal([1], @storage.documents.fetch("source/slots/b/copy.json").fetch("value").fetch("transfer").fetch("parts").map { |part| part.fetch("partNumber") })
    @storage.part_error = nil
    refute_nil _copy
    assert_equal([0, 256 * 1024 * 1024, 256 * 1024 * 1024], @storage.parts.map { |part| part.fetch(:offset) }.sort)
  end

  #: () -> void
  def test_parallel_copy_bounds_requests_drains_failure_and_resumes_contiguous_receipts
    @source.fetch("release").fetch("pmtiles")["bytes"] = (4 * 256 * 1024 * 1024) + 1
    _inventory
    started = Queue.new
    release = Queue.new
    original = @storage.method(:copy_part)
    @storage.part_error = 2
    @storage.define_singleton_method(:copy_part) do |**input|
      started.push(input.fetch(:part_number))
      release.pop
      original.call(**input)
    end
    worker = Thread.new do
      _copy
    rescue StandardError => error
      error
    end
    begin
      requests = Timeout.timeout(5) { Array.new(4) { started.pop } }
      assert_equal [1, 2, 3, 4], requests.sort
      assert started.empty?, "The fifth part must wait for the current batch."
      assert worker.alive?
      4.times { release.push(true) }
      failure = Timeout.timeout(5) { worker.value }
      assert_instance_of RuntimeError, failure
      assert_equal "temporary copy failure", failure.message
      assert_equal [1, 2, 3, 4], @storage.parts.map { |part| part.fetch(:part_number) }.sort
      assert_empty @storage.completions
      receipts = @storage.documents.fetch("source/slots/b/copy.json").fetch("value").fetch("transfer").fetch("parts")
      assert_equal([1], receipts.map { |part| part.fetch("partNumber") })
      @storage.part_error = nil
      @storage.define_singleton_method(:copy_part) { |**input| original.call(**input) }
      refute_nil _copy
      assert_equal [1, 2, 2, 3, 3, 4, 4, 5], @storage.parts.map { |part| part.fetch(:part_number) }.sort
      assert_equal([1, 2, 3, 4, 5], @storage.completions.last.fetch(:parts).map { |part| part.fetch("partNumber") })
    ensure
      4.times { release.push(true) }
      worker.join
    end
  end

  #: () -> void
  def test_cancellation_stops_and_drains_every_parallel_request_before_returning
    @source.fetch("release").fetch("pmtiles")["bytes"] = 4 * 256 * 1024 * 1024
    _inventory
    started = Queue.new
    finished = Queue.new
    blocked = Queue.new
    signal = Cataqui::Mapshot::SourceImportSignal.new
    @storage.define_singleton_method(:copy_part) do |signal:, part_number:, **|
      signal.with_timeout(seconds: 10) do
        started.push(part_number)
        blocked.pop
      end
    ensure
      finished.push(part_number)
    end
    worker = Thread.new do
      _copy(signal: signal)
    rescue StandardError => error
      error
    end
    begin
      assert_equal [1, 2, 3, 4], Timeout.timeout(5) { Array.new(4) { started.pop } }.sort
      signal.abort!
      failure = Timeout.timeout(5) { worker.value }
      assert_instance_of Cataqui::Mapshot::SourceImportError, failure
      assert_equal "ABORTED", failure.code
      assert_equal [1, 2, 3, 4], Array.new(4) { finished.pop }.sort
      assert_empty @storage.completions
      assert_empty @storage.documents.fetch("source/slots/b/copy.json").fetch("value").fetch("transfer").fetch("parts")
    ensure
      signal.abort!
      worker.join
    end
  end

  def test_expiration_before_first_part_retains_upload_for_resume
    _large
    calls = 0
    service = Cataqui::Mapshot::Copy.new(source: @storage, source_bucket: "staging", destination: @storage, data: @data, clock: -> { calls += 1; calls == 1 ? 0 : 100 })
    assert_nil service.copy(**_input, deadline_at: 50)
    assert_empty @storage.parts
    refute_nil _copy
  end

  def test_changed_source_before_or_after_parts_blocks_completion
    [1, 2].each do |at|
      setup
      _large
      # Inventory HEADs happen first; only source HEADs matter to this assertion.
      original = @storage.method(:head_object)
      count = 0
      @storage.define_singleton_method(:head_object) do |key:, **args|
        if key == asset.fetch("key")
          count += 1
          next({ "kind" => "object", "etag" => "changed", "bytes" => asset.fetch("bytes") }) if count == at
        end
        original.call(key: key, **args)
      end
      assert_match(/source changed/, assert_raises(RuntimeError) { _copy }.message)
      assert_empty @storage.completions
    end
  end

  def test_multipart_receipts_and_completion_are_verified
    %i[part_etag completion_bytes completion_etag].each do |field|
      setup
      _large
      @storage.public_send("#{field}=", field == :completion_bytes ? 1 : "invalid")
      assert_match(/ETag|verification/, assert_raises(RuntimeError) { _copy }.message)
    end
  end

  def test_multipart_checkpoint_cannot_refer_to_another_target
    _large
    assert_nil _copy(deadline_at: 0)
    @storage.documents.fetch("source/slots/b/copy.json").fetch("value")["transfer"] = { "key" => "foreign", "uploadId" => "upload", "parts" => [] }
    assert_match(/checkpoint conflicts/, assert_raises(RuntimeError) { _copy }.message)
  end

  def test_missing_oversized_or_changed_inventory_is_rejected
    %i[missing oversized changed integrity].each do |kind|
      setup
      object = @storage.objects.fetch(@inventory.fetch("key"))
      case kind
      when :missing then @storage.objects.delete(@inventory.fetch("key"))
      when :oversized then object["bytes"] = 3 * 1024 * 1024; @inventory["bytes"] = object.fetch("bytes")
      when :changed then object["bytes"] += 1
      when :integrity then @inventory["sha256"] = "bad"
      end
      assert_match(/inventory/, assert_raises(RuntimeError) { _copy }.message)
    end
  end

  def test_copy_must_include_the_archive_and_can_copy_other_assets
    asset = @storage.asset.merge("key" => "index", "contentType" => "application/json")
    @storage.asset = asset
    _inventory(asset: asset)
    assert_match(/omitted/, assert_raises(RuntimeError) { _copy }.message)
    assert_equal "index", @storage.puts.first.fetch(:key)
  end

  private

  def _large
    @source.fetch("release").fetch("pmtiles")["bytes"] = 257 * 1024 * 1024
    _inventory
  end

  def _inventory(asset: nil)
    @storage.asset = asset || { "key" => @source.dig("release", "pmtiles", "objectKey"), "bytes" => @source.dig("release", "pmtiles", "bytes"), "etag" => "source-etag", "contentType" => "application/octet-stream", "sha256" => Digest::SHA256.hexdigest("x" * 1000) }
    page = @storage.encode(key: "page", value: { "version" => 1, "assets" => [@storage.asset] })
    @inventory = @storage.encode(key: "inventory", value: { "version" => 1, "pages" => [page] })
  end

  def _input
    { operation: "f" * 64, slot: "b", source: @source, inventory: @inventory }
  end

  def _copy(deadline_at: 100, **params)
    @service.copy(**_input.merge(params), deadline_at: deadline_at)
  end
end
