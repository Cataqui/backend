# frozen_string_literal: true

require_relative "../../test/test_helper"
require "fileutils"
require "open3"
require "rbconfig"
require "stringio"
require "tmpdir"
require_relative "release-data"

class MapshotReleaseDataTest < Minitest::Test
  class Domain
    attr_reader :calls, :fingerprint_calls
    attr_accessor :failure

    def initialize
      @calls = []
      @fingerprint_calls = []
    end

    def validate(kind:, value:)
      @calls << [kind, value]
      raise "private validation detail" if failure
      value
    end

    def fingerprint(source:)
      @fingerprint_calls << {source: source}
      "fingerprint"
    end
  end

  class Operations
    attr_reader :calls
    attr_accessor :failure, :block

    def initialize
      @calls = []
    end

    def read
      _record("state.read")
      {"etag" => "generation", "value" => {"active" => nil}}
    end

    def write(etag:, value:)
      _record("state.write", etag: etag, value: value)
    end

    def prepare(code_revision:, operation:, deadline_at:, signal:, refresh: nil, phase: nil, promote: nil)
      _record("prepare", code_revision: code_revision, operation: operation, deadline_at: deadline_at, signal: signal,
        refresh: refresh, phase: phase, promote: promote)
      {"source" => "prepared"}
    end

    def read_prepared(slot:, operation:, signal:)
      _record("sources.readPrepared", slot: slot, operation: operation, signal: signal)
      nil
    end

    def put_raw(key:, bytes:, content_type:, signal:)
      _record("storage.putArtifact", key: key, bytes: bytes, content_type: content_type, signal: signal)
    end

    def head_object(key:, signal:, timeout:)
      _record("storage.headObject", key: key, signal: signal, timeout: timeout)
      {"kind" => "missing"}
    end

    def read_range(key:, offset:, length:, etag:, signal:)
      _record("storage.readRange", key: key, offset: offset, length: length, etag: etag, signal: signal)
      "\x00\xff".b
    end

    def clean(signal:)
      _record("retention.clean", signal: signal)
    end

    private

    def _record(name, **params)
      @calls << [name, params]
      raise "private provider detail" if failure
      block&.call(params)
      "provider result must not escape a void operation"
    end
  end

  Tools = Struct.new(:storage, :state, :reservations, :sources, :promotion, :retention, keyword_init: true)

  def setup
    @directory = Dir.mktmpdir("mapshot-release-data-test-")
    @domain = Domain.new
    @operations = Operations.new
    @factories = []
    @tools = Tools.new(**%i[storage state reservations sources promotion retention].to_h { |key| [key, @operations] })
    @command = Cataqui::Mapshot::ReleaseData.new(domain: @domain, create_tools: lambda do |**params|
      @factories << params
      @tools
    end)
    @output = File.join(@directory, "result.json")
    @errors = StringIO.new
  end

  def teardown
    FileUtils.remove_entry(@directory)
  end

  def test_dispatches_every_public_operation_and_retains_exact_private_result_contract
    cases = [
      [{"operation" => "state.read"}, {"etag" => "generation", "value" => {"active" => nil}}, "state.read", {}],
      [{"operation" => "state.write", "etag" => nil, "value" => {"version" => 1}}, nil, "state.write", {etag: nil, value: {"version" => 1}}],
      [{"operation" => "sources.prepare", "codeRevision" => "revision", "operationId" => "reservation", "refresh" => true, "phase" => "verify", "deadlineAt" => 123}, {"source" => "prepared"}, "prepare", {code_revision: "revision", operation: "reservation", deadline_at: 123, refresh: true, phase: "verify", promote: nil}],
      [{"operation" => "promotion.prepare", "codeRevision" => "revision", "operationId" => "reservation", "promote" => true, "deadlineAt" => 123}, {"source" => "prepared"}, "prepare", {code_revision: "revision", operation: "reservation", deadline_at: 123, refresh: nil, phase: nil, promote: true}],
      [{"operation" => "sources.readPrepared", "slot" => "b", "operationId" => "reservation"}, nil, "sources.readPrepared", {slot: "b", operation: "reservation"}],
      [{"operation" => "storage.headObject", "key" => "artifact"}, {"kind" => "missing"}, "storage.headObject", {key: "artifact", timeout: 15}],
      [{"operation" => "retention.clean"}, nil, "retention.clean", {}]
    ]
    cases.each do |input, expected, name, params|
      begin
        File.unlink(@output)
      rescue Errno::ENOENT
        # Each iteration writes one new exclusive result file.
      end
      assert_equal 0, _run(input)
      result = JSON.parse(File.read(@output, encoding: "UTF-8"))
      expected.nil? ? assert_nil(result) : assert_equal(expected, result)
      assert_equal 0o600, File.stat(@output).mode & 0o777
      actual_name, actual_params = @operations.calls.last
      assert_equal name, actual_name
      signal = actual_params.delete(:signal)
      assert_kind_of Cataqui::Mapshot::SourceImportSignal, signal if input.fetch("operation") != "state.read" && input.fetch("operation") != "state.write"
      assert_equal params, actual_params
      assert_equal "release-input", @domain.calls.last.first
      assert_equal "staging", @factories.last.fetch(:environment)
    end
    assert_empty @errors.string
  end

  def test_fingerprint_dispatches_to_the_application_owned_domain
    source = {"id" => "source"}
    assert_equal 0, _run({"operation" => "reservations.fingerprint", "source" => source})
    assert_equal "fingerprint", JSON.parse(File.read(@output))
    assert_equal [{source: source}], @domain.fingerprint_calls
    assert_empty @operations.calls
  end

  def test_artifact_upload_preserves_binary_contents_and_returns_null
    artifact = File.join(@directory, "artifact.tar.gz")
    File.binwrite(artifact, "\x00\xff".b)
    assert_equal 0, _run({"operation" => "storage.putArtifact", "key" => "artifact", "path" => artifact})
    assert_nil JSON.parse(File.read(@output))
    params = @operations.calls.last.last
    assert_equal "\x00\xff".b, params.fetch(:bytes)
    assert_equal "application/gzip", params.fetch(:content_type)
  end

  def test_range_read_writes_private_binary_file_and_preserves_conditional_fields
    path = File.join(@directory, "artifact.tar.gz")
    assert_equal 0, _run({"operation" => "storage.readRange", "key" => "artifact", "offset" => 3, "length" => 2, "etag" => "expected", "path" => path})
    assert_equal "\x00\xff".b, File.binread(path)
    assert_equal 0o600, File.stat(path).mode & 0o777
    assert_nil JSON.parse(File.read(@output))
    assert_equal({key: "artifact", offset: 3, length: 2, etag: "expected"}, @operations.calls.last.last.reject { |key, _value| key == :signal })
  end

  def test_uploads_worker_artifact_larger_than_eight_mebibytes
    path = File.join(@directory, "worker.tar.gz")
    File.open(path, "wb") { |file| file.truncate((8 * 1024 * 1024) + 1) }
    assert_equal 0, _run({"operation" => "storage.putArtifact", "key" => "artifact", "path" => path})
    assert_equal File.size(path), @operations.calls.last.last.fetch(:bytes).bytesize
    assert_nil JSON.parse(File.read(@output))
  end

  def test_private_output_never_overwrites_existing_file_or_symlink
    File.write(@output, "keep")
    assert_equal 1, _run({"operation" => "state.read"})
    assert_equal "keep", File.read(@output)
    File.unlink(@output)
    target = File.join(@directory, "target")
    File.write(target, "target")
    File.symlink(target, @output)
    assert_equal 1, _run({"operation" => "state.read"})
    assert_equal "target", File.read(target)
  end

  def test_range_result_never_overwrites_existing_file_or_symlink
    path = File.join(@directory, "artifact")
    File.write(path, "keep")
    assert_equal 1, _run({"operation" => "storage.readRange", "key" => "artifact", "offset" => 0, "length" => 2, "etag" => "expected", "path" => path})
    assert_equal "keep", File.read(path)
    File.unlink(path)
    target = File.join(@directory, "target")
    File.write(target, "target")
    File.symlink(target, path)
    assert_equal 1, _run({"operation" => "storage.readRange", "key" => "artifact", "offset" => 0, "length" => 2, "etag" => "expected", "path" => path})
    assert_equal "target", File.read(target)
  end

  def test_input_validation_failure_stops_before_provider_composition_and_hides_details
    @domain.failure = true
    assert_equal 1, _run({"operation" => "state.read"})
    assert_empty @factories
    refute_includes @errors.string, "private"
    assert_equal "Mapshot data command failed; provider details were suppressed to protect credentials.\n", @errors.string
  end

  def test_rejects_invalid_arguments_large_requests_and_invalid_json_before_composition
    [[], ["--output", "relative"], ["--output", @output, "extra"], ["--unknown"]].each do |arguments|
      assert_equal 1, @command.run(arguments: arguments, input: StringIO.new("{}"), errors: @errors)
    end
    ["x" * ((1024 * 1024) + 1), "{", "\xff".b, ""].each do |input|
      assert_equal 1, @command.run(arguments: ["--output", @output], input: StringIO.new(input), errors: @errors)
    end
    assert_empty @factories
  end

  def test_unknown_operation_and_provider_failure_are_sanitized
    assert_equal 1, _run({"operation" => "unsupported"})
    @operations.failure = true
    assert_equal 1, _run({"operation" => "state.read"})
    refute_includes @errors.string, "private provider detail"
    refute File.exist?(@output)
  end

  def test_provider_operations_receive_one_bounded_signal_for_the_entire_dispatch
    @operations.block = ->(params) { params.fetch(:signal).abort! }
    assert_equal 1, _run({"operation" => "retention.clean"})
    refute File.exist?(@output)
  end

  def test_real_composition_uses_supported_ruby_boundaries_for_both_environments_without_provider_io
    variables = {"CLOUDFLARE_ACCOUNT_ID" => "a" * 32, "MAPSHOT_R2_ACCESS_KEY_ID" => "offline", "MAPSHOT_R2_SECRET_ACCESS_KEY" => "offline"}
    %w[staging production].each do |environment|
      tools = Cataqui::Mapshot::ReleaseDataTools.new(environment: environment, variables: variables, domain: @domain)
      assert_kind_of Cataqui::Mapshot::SourceImportStorageService, tools.storage
      assert_kind_of Cataqui::Mapshot::Deployment, tools.state
      assert_kind_of Cataqui::Mapshot::SourceReservation, tools.reservations
      assert_kind_of Cataqui::Mapshot::Source, tools.sources
      assert_kind_of Cataqui::Mapshot::Promotion, tools.promotion
      assert_kind_of Cataqui::Mapshot::Retention, tools.retention
    end
  end

  def test_executable_cli_failure_is_sanitized
    _stdout, stderr, status = Open3.capture3(RbConfig.ruby, File.join(__dir__, "release-data.rb"), "--unknown")
    refute status.success?
    assert_equal "Mapshot data command failed; provider details were suppressed to protect credentials.\n", stderr
  end

  private

  def _run(input)
    @command.run(arguments: ["--output", @output], input: StringIO.new(JSON.generate(input.merge("environment" => "staging"))), variables: {}, errors: @errors)
  end
end
