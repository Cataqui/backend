# frozen_string_literal: true

require_relative "../../test/test_helper"
require_relative "mapshot-source"
require_relative "mapshot-source-reservation"

class MapshotSourceTest < Minitest::Test
  class MemoryState
    attr_accessor :value
    attr_reader :writes

    def initialize(active: nil)
      @value = {"version" => 1, "active" => active, "previous" => nil, "pending" => nil}
      @generation = 1
      @writes = []
    end

    def read
      {"etag" => @generation.to_s, "value" => Marshal.load(Marshal.dump(@value))}
    end

    def write(value:, etag:)
      raise "CAS failed" unless etag == @generation.to_s

      @writes << {value: value, etag: etag}
      @value = Marshal.load(Marshal.dump(value))
      @generation += 1
    end
  end

  class MemoryStorage
    attr_accessor :conflict_on_write, :failure
    attr_reader :documents, :reads, :writes, :deletions

    def initialize
      @documents = {}
      @reads = []
      @writes = []
      @deletions = []
    end

    def read_document(**input)
      raise failure if failure

      @reads << input
      stored = @documents[input.fetch(:key)]
      stored ? Marshal.load(Marshal.dump(stored.merge("kind" => "document"))) : {"kind" => "missing"}
    end

    def write_document(**input)
      @writes << input
      old = @documents[input.fetch(:key)]
      return {"kind" => "conflict"} if conflict_on_write == @writes.length || old&.fetch("etag") != input.fetch(:expected_etag)

      etag = ((old&.fetch("etag") || "0").to_i + 1).to_s
      @documents[input.fetch(:key)] = {"etag" => etag, "value" => Marshal.load(Marshal.dump(input.fetch(:value)))}
      {"kind" => "written", "etag" => etag}
    end

    def delete(**input)
      @deletions << input
    end
  end

  def test_empty_environment_seeds_and_clears_its_slot_before_importing_once
    setup = _setup
    setup.fetch(:importer).hook = lambda do |_input|
      assert_equal [{keys: ["source/slots/a/planet.pmtiles"], timeout: 30, signal: setup.fetch(:signal)}], setup.fetch(:storage).deletions
      assert_equal "preparing", setup.fetch(:state).value.fetch("pending").fetch("stage")
    end
    2.times { assert_equal setup.fetch(:source), setup.fetch(:service).prepare(**setup.fetch(:input)) }
    assert_equal 1, setup.fetch(:importer).calls.length
    assert_equal "source/slots/a/planet.pmtiles", setup.fetch(:importer).calls.first.fetch(:input).fetch("objectKey")
  end

  def test_preparation_keeps_each_storage_request_bounded_to_three_minutes
    setup = _setup
    setup.fetch(:service).prepare(**setup.fetch(:input).reject { |key, _value| key == :timeout })
    requests = setup.fetch(:storage).reads + setup.fetch(:storage).writes + setup.fetch(:storage).deletions
    refute_empty requests
    assert(requests.all? { |request| request.fetch(:timeout) == 180 })
    assert_equal setup.fetch(:signal), setup.fetch(:importer).calls.first.fetch(:signal)
  end

  def test_unowned_stale_slot_metadata_is_replaced_without_validating_an_obsolete_document
    setup = _setup
    setup.fetch(:storage).documents["source/slots/a/preparation.json"] = {"etag" => "3", "value" => {"obsolete" => true}}
    assert_equal setup.fetch(:source), setup.fetch(:service).prepare(**setup.fetch(:input))
    assert_equal "operation", setup.fetch(:storage).documents.fetch("source/slots/a/preparation.json").fetch("value").fetch("operation")
  end

  def test_code_only_deployment_reuses_the_map_without_discovering_or_importing
    setup = _setup(active: true)
    setup.fetch(:service).prepare(**setup.fetch(:input).merge(refresh: false))
    setup.fetch(:service).prepare(**setup.fetch(:input))
    assert_empty setup.fetch(:archives).calls
    assert_empty setup.fetch(:importer).calls
    assert_empty setup.fetch(:storage).deletions
    assert_equal "a", setup.fetch(:state).value.fetch("pending").fetch("slot")
  end

  #: () -> void
  def test_unchanged_archive_reuses_the_active_dataset_without_transfer
    setup = _setup(active: true, same_archive: true)
    assert_equal setup.fetch(:source), setup.fetch(:service).prepare(**setup.fetch(:input))
    assert_empty setup.fetch(:importer).calls
    assert_empty setup.fetch(:storage).deletions
    assert_equal [{signal: setup.fetch(:signal)}], setup.fetch(:archives).calls
    assert_equal "a", setup.fetch(:state).value.fetch("pending").fetch("slot")
    assert_nil setup.fetch(:storage).documents.fetch("source/slots/a/preparation.json").fetch("value").fetch("input")
    refute setup.fetch(:storage).documents.key?("source/slots/b/preparation.json")
  end

  def test_matching_digest_with_a_different_size_still_uses_the_inactive_slot
    setup = _setup(active: true, same_archive: true)
    setup.fetch(:archives).archive["bytes"] += 1
    setup.fetch(:service).prepare(**setup.fetch(:input))
    assert_equal "b", setup.fetch(:state).value.fetch("pending").fetch("slot")
    assert_equal "source/slots/b/planet.pmtiles", setup.fetch(:storage).deletions.first.fetch(:keys).first
  end

  def test_incomplete_phase_retains_its_pinned_archive_and_resumes_without_discovery
    setup = _setup(active: true)
    setup.fetch(:importer).results.unshift({"kind" => "running"})
    assert_nil setup.fetch(:service).prepare(**setup.fetch(:input).merge(phase: "verify"))
    assert_equal setup.fetch(:source), setup.fetch(:service).prepare(**setup.fetch(:input))
    assert_equal 1, setup.fetch(:archives).calls.length
    assert_equal setup.fetch(:importer).calls.first.fetch(:input), setup.fetch(:importer).calls.last.fetch(:input)
    assert_equal "verify", setup.fetch(:importer).calls.first.fetch(:phase)
    assert_equal setup.fetch(:input).fetch(:deadline_at), setup.fetch(:importer).calls.first.fetch(:deadline_at)
    assert_equal setup.fetch(:signal), setup.fetch(:importer).calls.first.fetch(:signal)
  end

  def test_missing_pinned_input_fails_closed_without_rediscovering
    setup = _setup
    setup.fetch(:importer).results.unshift({"kind" => "running"})
    setup.fetch(:service).prepare(**setup.fetch(:input))
    setup.fetch(:storage).documents.clear
    assert_match "Pinned source preparation is missing", assert_raises(RuntimeError) { setup.fetch(:service).prepare(**setup.fetch(:input)) }.message
    assert_equal 1, setup.fetch(:importer).calls.length
  end

  def test_different_checkout_cannot_prepare_a_reserved_source
    setup = _setup
    setup.fetch(:service).prepare(**setup.fetch(:input))
    assert_match "pinned preparation checkout", assert_raises(RuntimeError) { setup.fetch(:service).prepare(**setup.fetch(:input).merge(code_revision: "different")) }.message
  end

  def test_import_failure_keeps_its_durable_preparation
    setup = _setup
    setup.fetch(:importer).results.unshift({"kind" => "failed", "code" => "integrity-failed"})
    assert_match "integrity-failed", assert_raises(RuntimeError) { setup.fetch(:service).prepare(**setup.fetch(:input)) }.message
    assert_equal "preparing", setup.fetch(:state).value.fetch("pending").fetch("stage")
  end

  def test_interrupted_activation_blocks_imports
    ["deploying", "recovering"].each do |stage|
      setup = _setup
      _pin(setup: setup, stage: stage, input: {"id" => "operation"})
      assert_match "Recover the interrupted deployment", assert_raises(RuntimeError) { setup.fetch(:service).prepare(**setup.fetch(:input)) }.message
      assert_empty setup.fetch(:importer).calls
    end
  end

  def test_reservation_must_exist_after_preparation_admission
    setup = _setup
    setup.fetch(:reservations).define_singleton_method(:begin) { |**_input| nil }
    assert_match "Recover the interrupted deployment", assert_raises(RuntimeError) { setup.fetch(:service).prepare(**setup.fetch(:input)) }.message
  end

  def test_preparation_with_another_operation_is_rejected
    setup = _setup
    _pin(setup: setup, input: {"id" => "operation"})
    setup.fetch(:storage).documents.fetch("source/slots/a/preparation.json").fetch("value")["operation"] = "other"
    assert_match "Pinned source preparation is missing", assert_raises(RuntimeError) { setup.fetch(:service).prepare(**setup.fetch(:input)) }.message
  end

  def test_reused_source_requires_the_active_slot_and_a_completed_source
    [nil, "other-slot", "missing-active"].each do |scenario|
      setup = _setup(active: true)
      _pin(setup: setup, source: scenario ? setup.fetch(:source) : nil)
      setup.fetch(:state).value.fetch("active")["slot"] = scenario if scenario == "other-slot"
      setup.fetch(:state).value["active"] = nil if scenario == "missing-active"
      assert_match "Pinned source preparation is missing", assert_raises(RuntimeError) { setup.fetch(:service).prepare(**setup.fetch(:input)) }.message
    end
  end

  def test_preparation_disappearing_after_import_is_rejected
    setup = _setup
    setup.fetch(:importer).hook = ->(_input) { setup.fetch(:storage).documents.clear }
    assert_match "Source preparation disappeared", assert_raises(RuntimeError) { setup.fetch(:service).prepare(**setup.fetch(:input)) }.message
  end

  def test_preparation_admission_and_completion_conflicts_fail_closed
    [1, 2].each do |write_number|
      setup = _setup
      setup.fetch(:storage).conflict_on_write = write_number
      assert_match "concurrently", assert_raises(RuntimeError) { setup.fetch(:service).prepare(**setup.fetch(:input)) }.message
    end
  end

  def test_code_only_reservation_conflicts_fail_closed_for_existing_metadata
    setup = _setup(active: true)
    setup.fetch(:storage).documents["source/slots/a/preparation.json"] = {"etag" => "1", "value" => {"obsolete" => true}}
    setup.fetch(:storage).conflict_on_write = 1
    assert_match "Slot preparation changed concurrently", assert_raises(RuntimeError) { setup.fetch(:service).prepare(**setup.fetch(:input).merge(refresh: false)) }.message
  end

  def test_read_prepared_requires_the_reserved_operation_and_completed_valid_source
    setup = _setup
    input = {slot: "a", operation: "operation", timeout: 30, signal: setup.fetch(:signal)}
    assert_nil setup.fetch(:service).read_prepared(**input)
    _pin(setup: setup, source: setup.fetch(:source))
    assert_equal setup.fetch(:source), setup.fetch(:service).read_prepared(**input)
    assert_nil setup.fetch(:service).read_prepared(**input.merge(operation: "different"))
    setup.fetch(:storage).documents.fetch("source/slots/a/preparation.json").fetch("value")["source"] = nil
    assert_nil setup.fetch(:service).read_prepared(**input)
    setup.fetch(:storage).documents.fetch("source/slots/a/preparation.json")["value"] = {"invalid" => true}
    assert_raises(ArgumentError) { setup.fetch(:service).read_prepared(**input) }
    setup.fetch(:storage).failure = IOError.new("storage unavailable")
    assert_raises(IOError) { setup.fetch(:service).read_prepared(**input) }
  end

  private

  def _setup(active: false, same_archive: false)
    source = {"release" => {"pmtiles" => {"digest" => {"value" => "digest"}, "bytes" => 1000}}, "prepared" => {"manifestKey" => "manifest"}}
    state = MemoryState.new(active: active ? {"slot" => "a", "source" => source} : nil)
    storage = MemoryStorage.new
    data = Object.new
    data.define_singleton_method(:validate) do |kind:, value:|
      raise ArgumentError, "unexpected schema" unless kind == "preparation"
      raise ArgumentError, "invalid preparation" if value.key?("invalid")

      value
    end
    archives = Object.new
    archives.define_singleton_method(:calls) { @calls ||= [] }
    archives.define_singleton_method(:archive) { @archive }
    archives.instance_variable_set(:@archive, {"blake3" => same_archive ? "digest" : "different", "bytes" => 1000})
    archives.define_singleton_method(:read_latest) do |**input|
      calls << input
      archive
    end
    importer = Object.new
    importer.define_singleton_method(:calls) { @calls ||= [] }
    importer.define_singleton_method(:results) { @results }
    importer.instance_variable_set(:@results, [{"kind" => "ready", "release" => source.fetch("release"), "prepared" => source.fetch("prepared")}])
    importer.define_singleton_method(:hook=) { |value| @hook = value }
    importer.define_singleton_method(:run) do |**input|
      calls << input
      @hook&.call(input)
      results.length > 1 ? results.shift : results.first
    end
    reservations = Cataqui::Mapshot::SourceReservation.new(state: state)
    signal = Object.new
    service = Cataqui::Mapshot::Source.new(state: state, reservations: reservations, storage: storage, archives: archives, importer: importer, data: data)
    {
      service: service, state: state, storage: storage, source: source, archives: archives, importer: importer,
      signal: signal, reservations: reservations,
      input: {code_revision: "revision", operation: "operation", refresh: true, phase: "prepare", timeout: 30, deadline_at: 123_000, signal: signal}
    }
  end

  def _pin(setup:, input: nil, source: nil, stage: "preparing")
    setup.fetch(:state).value["pending"] = {"operation" => "operation", "codeRevision" => "revision", "slot" => "a", "stage" => stage, "candidate" => nil}
    setup.fetch(:storage).documents["source/slots/a/preparation.json"] = {"etag" => "1", "value" => {"operation" => "operation", "input" => input, "source" => source}}
  end
end
