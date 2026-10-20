# frozen_string_literal: true

require_relative "../../test/test_helper"
require_relative "mapshot-deployment"

class MapshotDeploymentTest < Minitest::Test
  def test_missing_journal_returns_an_empty_environment_and_conditional_creation
    calls = []
    storage = Object.new
    storage.define_singleton_method(:read_document) do |**input|
      calls << input
      {"kind" => "missing"}
    end
    storage.define_singleton_method(:write_document) do |**input|
      calls << input
      {"kind" => "written", "etag" => "new"}
    end
    data = _data
    repository = Cataqui::Mapshot::Deployment.new(storage: storage, data: data)
    initial = repository.read
    assert_equal({"etag" => nil, "value" => {"version" => 1, "active" => nil, "previous" => nil, "pending" => nil}}, initial)
    repository.write(value: initial.fetch("value"), etag: initial.fetch("etag"))
    assert_equal({key: "deployment.json", maximum_bytes: 1024 * 1024, timeout: 15}, calls.first)
    assert_equal({key: "deployment.json", value: initial.fetch("value"), expected_etag: nil, timeout: 15}, calls.last)
  end

  def test_existing_journal_is_validated_and_retains_its_cas_token
    state = {"version" => 1}
    data = _data
    storage = Object.new
    storage.define_singleton_method(:read_document) { |**_input| {"kind" => "document", "etag" => "current", "value" => state} }
    repository = Cataqui::Mapshot::Deployment.new(storage: storage, data: data)
    assert_equal({"etag" => "current", "value" => state}, repository.read)
    assert_equal [{kind: "deployment-state", value: state}], data.calls
  end

  def test_concurrent_journal_write_fails_instead_of_overwriting_the_winner
    storage = Object.new
    storage.define_singleton_method(:write_document) { |**_input| {"kind" => "conflict"} }
    repository = Cataqui::Mapshot::Deployment.new(storage: storage, data: _data)
    error = assert_raises(RuntimeError) { repository.write(value: {"version" => 1}, etag: "stale") }
    assert_equal "Mapshot deployment state changed concurrently.", error.message
  end

  def test_trusted_state_writes_preserve_the_cas_token_without_revalidating_the_state
    state = {"version" => 1, "active" => nil, "previous" => nil, "pending" => nil}
    calls = []
    storage = Object.new
    storage.define_singleton_method(:write_document) do |**input|
      calls << input
      {"kind" => "written", "etag" => "new"}
    end
    data = Object.new
    data.define_singleton_method(:validate) { |**_input| raise "Trusted state must not be revalidated." }
    repository = Cataqui::Mapshot::Deployment.new(storage: storage, data: data)
    repository.write(value: state, etag: "current")
    assert_equal [{key: "deployment.json", value: state, expected_etag: "current", timeout: 15}], calls
  end

  private

  def _data
    data = Object.new
    data.define_singleton_method(:calls) { @calls ||= [] }
    data.define_singleton_method(:validate) do |**input|
      calls << input
      input.fetch(:value)
    end
    data
  end
end
