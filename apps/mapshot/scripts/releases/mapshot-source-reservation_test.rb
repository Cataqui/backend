# frozen_string_literal: true

require_relative "../../test/test_helper"
require_relative "mapshot-source-reservation"

class MapshotSourceReservationTest < Minitest::Test
  def test_new_dataset_reserves_the_other_slot_and_invalidates_only_its_previous_release
    setup = _setup(active: {"slot" => "a"}, previous: {"slot" => "b"})
    pending = setup.fetch(:service).begin(operation: "operation", code_revision: "revision", replace_data: true)
    assert_equal({"operation" => "operation", "codeRevision" => "revision", "slot" => "b", "stage" => "clearing", "candidate" => nil}, pending)
    assert_nil setup.fetch(:state).value.fetch("previous")
    assert_equal({"slot" => "a"}, setup.fetch(:state).value.fetch("active"))
    assert_equal "old", setup.fetch(:state).writes.first.fetch(:etag)
  end

  def test_initial_seed_reserves_slot_a_and_retains_an_unrelated_previous_release
    setup = _setup(previous: {"slot" => "b"})
    assert_equal "a", setup.fetch(:service).begin(operation: "operation", code_revision: "revision", replace_data: true).fetch("slot")
    assert_equal({"slot" => "b"}, setup.fetch(:state).value.fetch("previous"))
  end

  def test_code_only_deployment_reuses_the_active_slot_and_previous_release
    setup = _setup(active: {"slot" => "b"}, previous: {"slot" => "a"})
    pending = setup.fetch(:service).begin(operation: "operation", code_revision: "revision", replace_data: false)
    assert_equal "b", pending.fetch("slot")
    assert_equal "preparing", pending.fetch("stage")
    assert_equal({"slot" => "a"}, setup.fetch(:state).value.fetch("previous"))
  end

  def test_code_only_deployment_cannot_initialize_an_empty_environment
    error = assert_raises(RuntimeError) { _setup.fetch(:service).begin(operation: "operation", code_revision: "revision", replace_data: false) }
    assert_match "first dataset", error.message
  end

  def test_resuming_preparation_retains_the_pinned_operation_without_another_write
    setup = _setup(pending: {"stage" => "preparing", "codeRevision" => "revision", "operation" => "first"})
    assert_equal "first", setup.fetch(:service).begin(operation: "second", code_revision: "revision", replace_data: true).fetch("operation")
    assert_empty setup.fetch(:state).writes
  end

  def test_a_different_checkout_cannot_reuse_the_reserved_slot
    setup = _setup(pending: {"stage" => "clearing", "codeRevision" => "original"})
    error = assert_raises(RuntimeError) { setup.fetch(:service).begin(operation: "second", code_revision: "different", replace_data: true) }
    assert_match "pinned preparation revision", error.message
  end

  def test_interrupted_activation_or_recovery_fences_source_writes
    ["deploying", "recovering"].each do |stage|
      setup = _setup(pending: {"stage" => stage, "codeRevision" => "revision"})
      error = assert_raises(RuntimeError) { setup.fetch(:service).begin(operation: "operation", code_revision: "revision", replace_data: true) }
      assert_match "must be recovered", error.message
      assert_empty setup.fetch(:state).writes
    end
  end

  private

  def _setup(active: nil, previous: nil, pending: nil)
    state = Object.new
    state.define_singleton_method(:value) { @value }
    state.define_singleton_method(:writes) { @writes ||= [] }
    state.instance_variable_set(:@value, {"version" => 1, "active" => active, "previous" => previous, "pending" => pending})
    state.define_singleton_method(:read) { {"etag" => "old", "value" => value} }
    state.define_singleton_method(:write) do |**input|
      writes << input
      @value = input.fetch(:value)
    end
    {state: state, service: Cataqui::Mapshot::SourceReservation.new(state: state)}
  end
end
