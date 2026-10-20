# frozen_string_literal: true

require_relative "../../test/test_helper"
require_relative "mapshot-promotion"

class MapshotPromotionTest < Minitest::Test
  class State
    attr_accessor :value

    def initialize(value:)
      @value = value
      @_etag = 1
    end

    def read
      { "etag" => @_etag.to_s, "value" => Marshal.load(Marshal.dump(@value)) }
    end

    def write(etag:, value:)
      raise "state conflict" unless etag == @_etag.to_s

      @_etag += 1
      @value = Marshal.load(Marshal.dump(value))
    end
  end

  class Reservations
    attr_reader :calls

    def initialize(state:)
      @_state = state
      @calls = []
    end

    def begin(operation:, code_revision:, replace_data:)
      @calls.push({ operation: operation, code_revision: code_revision, replace_data: replace_data })
      value = @_state.value
      return value.fetch("pending") if value["pending"]

      slot = replace_data ? (value.dig("active", "slot") == "a" ? "b" : "a") : value.dig("active", "slot")
      value["pending"] = { "operation" => operation, "codeRevision" => code_revision, "slot" => slot, "stage" => replace_data ? "clearing" : "preparing", "candidate" => nil }
    end
  end

  class Storage
    attr_accessor :conflict
    attr_reader :documents, :deleted

    def initialize
      @documents = {}
      @deleted = []
    end

    def read_document(key:, **)
      @documents.fetch(key, { "kind" => "missing" })
    end

    def write_document(key:, value:, expected_etag:, **)
      return { "kind" => "conflict" } if @conflict || @documents.dig(key, "etag") != expected_etag

      etag = (@documents.dig(key, "etag").to_i + 1).to_s
      @documents[key] = { "kind" => "document", "value" => value, "etag" => etag }
      { "kind" => "written", "etag" => etag }
    end

    def delete(keys:, **)
      @deleted.concat(keys)
    end
  end

  class Inventory
    attr_accessor :interrupted
    attr_reader :calls

    def initialize
      @calls = []
    end

    def build(id:, source:, signal: nil)
      @calls.push({ id: id, source: source, signal: signal })
      raise "inventory interrupted" if @interrupted

      { "key" => "inventory", "bytes" => 100, "sha256" => "digest" }
    end
  end

  class Copy
    attr_reader :calls

    def initialize
      @calls = []
    end

    def copy(**input)
      @calls.push(input)
      input.fetch(:source)
    end
  end

  class Domain
    def fingerprint(source:)
      source.fetch("id")
    end

    def validate(kind:, value:)
      raise "Unexpected contract" unless kind == "promotion"

      value
    end
  end

  def setup
    @state = State.new(value: { "active" => { "slot" => "a", "fingerprint" => "a", "source" => { "id" => "a" } }, "pending" => nil, "previous" => nil })
    @staging = State.new(value: { "active" => { "slot" => "b", "fingerprint" => "b", "source" => { "id" => "b" } } })
    @reservations = Reservations.new(state: @state)
    @storage = Storage.new
    @inventory = Inventory.new
    @copy = Copy.new
    @service = Cataqui::Mapshot::Promotion.new(state: @state, staging: @staging, reservations: @reservations, storage: @storage, inventory: @inventory, copy: @copy, data: Domain.new)
  end

  def test_identical_staging_content_in_other_slot_skips_copy
    @staging.value.fetch("active").merge!("fingerprint" => "a", "source" => { "id" => "a" })
    assert_equal({ "id" => "a" }, _prepare)
    assert_equal "a", @state.value.dig("pending", "slot")
    assert_empty @copy.calls
    assert_empty @inventory.calls
    assert_empty @storage.deleted
  end

  def test_changed_staging_copies_to_inactive_slot_and_reuses_capture
    assert_equal({ "id" => "b" }, _prepare)
    assert_equal "b", @copy.calls.last.fetch(:slot)
    assert_equal ["source/slots/b/planet.pmtiles"], @storage.deleted
    assert_equal "preparing", @state.value.dig("pending", "stage")
    assert_equal Digest::SHA256.hexdigest("#{'f' * 64}:b"), @reservations.calls.last.fetch(:operation)
    _prepare
    assert_equal 1, @inventory.calls.length
    assert_equal 1, @storage.deleted.length
    assert_equal 2, @copy.calls.length
  end

  def test_interrupted_copy_recaptures_changed_staging
    _prepare
    @staging.value.fetch("active").merge!("fingerprint" => "c", "source" => { "id" => "c" })
    assert_equal({ "id" => "c" }, _prepare)
    assert_equal 2, @inventory.calls.length
    assert_equal 2, @storage.deleted.length
    assert_equal "a", @state.value.dig("active", "slot")
  end

  def test_successful_staging_is_required
    @staging.value["active"] = nil
    assert_match(/seeding/, assert_raises(RuntimeError) { _prepare }.message)
    assert_empty @copy.calls
  end

  def test_normal_code_release_keeps_current_source_without_staging
    @staging.value["active"] = nil
    assert_equal({ "id" => "a" }, _prepare(promote: false))
    assert_equal "a", @state.value.dig("pending", "slot")
    assert_empty @inventory.calls
    assert_empty @copy.calls
    assert_equal false, @reservations.calls.last.fetch(:replace_data)
  end

  def test_empty_production_is_seeded_from_staging_without_promote_flag
    @state.value["active"] = nil
    _prepare(promote: false)
    assert_equal "a", @copy.calls.last.fetch(:slot)
  end

  def test_normal_code_release_refuses_incomplete_data_promotion
    _prepare
    assert_match(/Resume the pending/, assert_raises(RuntimeError) { _prepare(promote: false) }.message)
  end

  def test_pinned_preparation_refuses_other_code_revision_and_deployment_stages
    _prepare
    assert_match(/pinned/, assert_raises(RuntimeError) { _prepare(code_revision: "2" * 40) }.message)
    %w[deploying recovering].each do |stage|
      @state.value.fetch("pending")["stage"] = stage
      assert_match(/pinned/, assert_raises(RuntimeError) { _prepare }.message)
    end
  end

  def test_promotion_capture_conditional_write_conflict_stops_copy
    @storage.conflict = true
    assert_match(/concurrently/, assert_raises(RuntimeError) { _prepare }.message)
    assert_empty @copy.calls
    assert_empty @storage.deleted
  end

  def test_missing_or_mismatched_pinned_metadata_cannot_reuse_progress
    %w[missing mismatched].each do |kind|
      setup
      _prepare
      if kind == "missing"
        @storage.documents.clear
      else
        @storage.documents.fetch("source/slots/b/promotion.json").fetch("value")["operation"] = "other"
      end
      assert_match(/Pinned source promotion is missing/, assert_raises(RuntimeError) { _prepare }.message)
      assert_equal 1, @copy.calls.length
    end
  end

  def test_interrupted_initial_capture_resumes_while_clearing
    @inventory.interrupted = true
    assert_match(/interrupted/, assert_raises(RuntimeError) { _prepare }.message)
    assert_equal "clearing", @state.value.dig("pending", "stage")
    @inventory.interrupted = false
    refute_nil _prepare
    assert_equal 1, @storage.deleted.length
  end

  def test_changed_staging_replaces_code_only_reservation_before_copy
    _prepare(promote: false)
    _prepare
    assert_equal "a", @state.value.dig("active", "slot")
    assert_equal "b", @state.value.dig("pending", "slot")
    assert_equal ["source/slots/b/planet.pmtiles"], @storage.deleted
  end

  def test_identical_staging_reuses_code_only_reservation
    _prepare(promote: false)
    @staging.value.fetch("active").merge!("fingerprint" => "a", "source" => { "id" => "a" })
    assert_equal({ "id" => "a" }, _prepare)
    assert_equal 1, @reservations.calls.length
    assert_empty @copy.calls
  end

  def test_old_metadata_in_clearing_stage_is_replaced
    _prepare
    @state.value.fetch("pending")["stage"] = "clearing"
    @storage.documents.fetch("source/slots/b/promotion.json").fetch("value")["operation"] = "old"
    _prepare
    assert_equal 2, @inventory.calls.length
    assert_equal @state.value.dig("pending", "operation"), @storage.documents.dig("source/slots/b/promotion.json", "value", "operation")
  end

  private

  def _prepare(**params)
    @service.prepare(**{ operation: "f" * 64, code_revision: "1" * 40, promote: true, deadline_at: 1000 }.merge(params))
  end
end
