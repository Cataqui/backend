# frozen_string_literal: true

require_relative "../../test/test_helper"
require "fileutils"
require "json"
require "tmpdir"
require_relative "domain-tools"

class MapshotDomainToolsTest < Minitest::Test
  def test_validation_dispatches_owned_contracts_without_duplicating_schema_logic
    calls = []
    paths = []
    tools = _fake_tools do |**input|
      calls << input
      paths << input.fetch(:output)
      _respond(input: input, value: input.fetch(:request))
    end
    assert_equal({"operation" => "validate", "kind" => "import-checkpoint", "value" => {"id" => "checkpoint"}}, tools.validate(kind: "import-checkpoint", value: {"id" => "checkpoint"}))
    assert_equal({"operation" => "validate", "kind" => "deployment-state", "value" => {"version" => 1}}, tools.validate(kind: "deployment-state", value: {"version" => 1}))
    assert(calls.all? { |input| input.fetch(:timeout) == 180 && input.fetch(:signal).nil? && input.fetch(:heartbeat).nil? })
    paths.each { |path| refute File.exist?(File.dirname(path)) }
  end

  #: () -> void
  def test_promotion_page_limit_uses_the_authoritative_domain_primitive
    calls = []
    tools = _fake_tools do |**input|
      calls << input.fetch(:request)
      _respond(input: input, value: 100)
    end

    assert_equal 100, tools.promotion_page_asset_limit
    assert_equal [{"operation" => "promotion.pageAssetLimit"}], calls
  end

  def test_fingerprint_uses_the_validated_source_instead_of_the_submitted_value
    fixture = _identities_fixture
    calls = []
    tools = _fake_tools do |**input|
      calls << input.fetch(:request)
      _respond(input: input, value: fixture.fetch("candidate"))
    end

    assert_equal fixture.fetch("expected").fetch("fingerprint"), tools.fingerprint(source: {"submitted" => true})
    assert_equal [{"operation" => "validate", "kind" => "source", "value" => {"submitted" => true}}], calls
  end

  def test_import_validation_returns_the_normalized_job_from_its_schema
    fixture = _identities_fixture
    normalized = fixture.fetch("importJob")
    submitted = normalized.to_a.reverse.to_h
    submitted["archive"] = normalized.fetch("archive").to_a.reverse.to_h.merge("bytes" => 1000.0, "observedAt" => 1e2)
    calls = []
    tools = _fake_tools do |**input|
      calls << input.fetch(:request)
      _respond(input: input, value: normalized)
    end

    result = tools.validate(kind: "import-job", value: submitted)
    assert_equal normalized, result
    assert_equal normalized.keys, result.keys
    assert_equal [{"operation" => "validate", "kind" => "import-job", "value" => submitted}], calls
  end

  def test_rejected_identity_inputs_preserve_the_schema_failure
    tools = _fake_tools do |**input|
      _respond(input: input, value: {"error" => {"code" => "INVALID_INPUT"}}, success: false)
    end

    _assert_code("INVALID_INPUT") { tools.fingerprint(source: {}) }
    _assert_code("INVALID_INPUT") { tools.validate(kind: "import-job", value: {}) }
  end

  def test_manifest_validation_and_file_enumeration_use_one_domain_request
    calls = []
    result = {"manifest" => {"validated" => true}, "files" => [{"path" => "header-root.bin"}]}
    tools = _fake_tools do |**input|
      calls << input.fetch(:request)
      _respond(input: input, value: result)
    end
    assert_equal result, tools.validate_index_manifest(value: {"original" => true})
    assert_equal [{"operation" => "index.files", "manifest" => {"original" => true}}], calls
  end

  def test_long_map_operations_forward_environment_deadline_signal_and_heartbeat
    calls = []
    signal = Cataqui::Mapshot::SourceImportSignal.new
    heartbeat = -> { flunk "The fake process should only forward this callback." }
    tools = _fake_tools do |**input|
      calls << input
      _respond(input: input, value: "ready")
    end
    assert_equal "ready", tools.verify_archive_and_extract_landmarks(checkpoint: {"id" => "checkpoint"}, work_directory: "/tmp/work", deadline_at: 123, signal: signal, heartbeat: heartbeat)
    assert_equal "ready", tools.prepare_indexes(release: {"pmtiles" => {"id" => "archive"}}, landmarks: {"path" => "landmarks"}, work_directory: "/tmp/work", deadline_at: 456, signal: signal)
    assert_equal({"operation" => "archive.verify", "environment" => "staging", "checkpoint" => {"id" => "checkpoint"}, "workDirectory" => "/tmp/work", "deadlineAt" => 123}, calls.first.fetch(:request))
    assert_equal({"operation" => "indexes.prepare", "environment" => "staging", "release" => {"pmtiles" => {"id" => "archive"}}, "landmarks" => {"path" => "landmarks"}, "workDirectory" => "/tmp/work", "deadlineAt" => 456}, calls.last.fetch(:request))
    assert(calls.all? { |input| input.fetch(:timeout) == 320 * 60 && input.fetch(:signal).equal?(signal) })
    assert_same heartbeat, calls.first.fetch(:heartbeat)
    assert_nil calls.last.fetch(:heartbeat)
  end

  def test_failed_adapter_outputs_preserve_supported_codes_and_sanitize_every_other_shape
    [
      [{"error" => {"code" => "INTEGRITY"}}, "INTEGRITY"],
      [{"error" => {}}, "PREPARATION"],
      [{"error" => "private diagnostics"}, "PREPARATION"],
      [{}, "PREPARATION"],
      [[], "PREPARATION"],
      [{"error" => {"code" => "private unknown code"}}, "PREPARATION"]
    ].each do |value, code|
      output_path = nil
      tools = _fake_tools do |**input|
        output_path = input.fetch(:output)
        _respond(input: input, value: value, success: false)
      end
      _assert_code(code) { tools.validate(kind: "source", value: {}) }
      refute File.exist?(File.dirname(output_path))
    end
  end

  def test_invalid_json_missing_output_and_io_failures_never_expose_private_details
    [
      ->(**input) { File.write(input.fetch(:output), "private malformed output"); true },
      ->(**_input) { true },
      ->(**_input) { raise IOError, "private provider token" }
    ].each do |execute|
      tools = Cataqui::Mapshot::DomainTools.new(environment: "staging", execute: execute)
      error = _assert_code("PREPARATION") { tools.validate(kind: "source", value: {}) }
      assert_nil error.cause
    end
  end

  def test_already_aborted_work_never_starts_a_child_and_domain_failures_keep_their_identity
    signal = Cataqui::Mapshot::SourceImportSignal.new
    signal.abort!
    tools = _fake_tools { |**_input| flunk "Already aborted work must not execute." }
    _assert_code("ABORTED") { tools.verify_archive_and_extract_landmarks(checkpoint: {}, work_directory: "/tmp/work", deadline_at: 123, signal: signal) }

    failure = Cataqui::Mapshot::SourceImportError.new(code: "STORAGE")
    tools = _fake_tools { |**_input| raise failure }
    assert_same failure, _assert_code("STORAGE") { tools.validate(kind: "source", value: {}) }
  end

  def test_real_child_receives_json_via_stdin_and_only_private_result_path_in_arguments
    _with_adapter(<<~JAVASCRIPT) do |tools, root|
      import {readFileSync, writeFileSync} from "node:fs";
      const request = JSON.parse(readFileSync(0, "utf8"));
      const output = process.argv[process.argv.indexOf("--output") + 1];
      writeFileSync(output, JSON.stringify({request: request, cwd: process.cwd(), marker: process.env.DOMAIN_TEST_MARKER, args: process.argv.slice(2)}));
    JAVASCRIPT
      result = tools.validate(kind: "source", value: {"secret" => "stdin only"})
      assert_equal({"operation" => "validate", "kind" => "source", "value" => {"secret" => "stdin only"}}, result.fetch("request"))
      assert_equal File.realpath(root), result.fetch("cwd")
      assert_equal "private environment value", result.fetch("marker")
      assert_equal "--output", result.fetch("args").first
      assert_equal 2, result.fetch("args").length
      refute File.exist?(File.dirname(result.fetch("args").last))
    end
  end

  def test_real_child_nonzero_exit_preserves_a_safe_domain_failure
    _with_adapter(<<~JAVASCRIPT) do |tools, _root|
      import {writeFileSync} from "node:fs";
      writeFileSync(process.argv[process.argv.indexOf("--output") + 1], JSON.stringify({error: {code: "INVALID_INPUT"}}));
      process.stderr.write("private provider diagnostic");
      process.exitCode = 1;
    JAVASCRIPT
      _assert_code("INVALID_INPUT") { tools.validate(kind: "source", value: {}) }
    end
  end

  def test_missing_node_adapter_is_reported_without_its_private_path
    Dir.mktmpdir("mapshot-domain-missing-", "/tmp") do |root|
      tools = Cataqui::Mapshot::DomainTools.new(environment: "production", application_root: root)
      _assert_code("PREPARATION") { tools.validate(kind: "source", value: {}) }
    end
  end

  def test_active_child_is_killed_and_reaped_after_cancellation
    _with_waiting_adapter do |tools, root|
      signal = Cataqui::Mapshot::SourceImportSignal.new
      worker = Thread.new do
        tools.verify_archive_and_extract_landmarks(checkpoint: {}, work_directory: root, deadline_at: 123, signal: signal)
      rescue Cataqui::Mapshot::SourceImportError => error
        error
      end
      pid = _wait_for_pid(root: root)
      signal.abort!
      assert_equal "ABORTED", worker.value.code
      assert_raises(Errno::ESRCH) { Process.kill(0, pid) }
      assert_raises(Errno::ECHILD) { Process.wait(pid, Process::WNOHANG) }
    ensure
      worker&.kill
      worker&.join
    end
  end

  def test_timeout_cleans_up_an_unresponsive_child
    _with_waiting_adapter do |tools, root|
      original = Timeout.method(:timeout)
      wait_for_pid = method(:_wait_for_pid)
      _replace_singleton_method(Timeout, :timeout, lambda do |seconds, *arguments, &block|
        wait_for_pid.call(root: root)
        original.call([seconds, 0.2].min, *arguments, &block)
      end) do
        _assert_code("PREPARATION") { tools.validate(kind: "source", value: {}) }
      end
      pid = Integer(File.read(File.join(root, "child.pid")))
      assert_raises(Errno::ESRCH) { Process.kill(0, pid) }
      assert_raises(Errno::ECHILD) { Process.wait(pid, Process::WNOHANG) }
    end
  end

  def test_output_capacity_stops_a_still_running_child
    _with_adapter(<<~JAVASCRIPT) do |tools, root|
      import {writeFileSync} from "node:fs";
      writeFileSync("child.pid", String(process.pid));
      process.stdout.write("x".repeat(64 * 1024 + 1));
      setInterval(() => {}, 1000);
    JAVASCRIPT
      _assert_code("PREPARATION") { tools.validate(kind: "source", value: {}) }
      pid = Integer(File.read(File.join(root, "child.pid")))
      assert_raises(Errno::ESRCH) { Process.kill(0, pid) }
    end
  end

  def test_output_capacity_is_checked_even_after_a_successful_child_exit
    _with_adapter(<<~JAVASCRIPT) do |tools, _root|
      import {writeFileSync} from "node:fs";
      writeFileSync(process.argv[process.argv.indexOf("--output") + 1], "true");
      process.stdout.write("x".repeat(64 * 1024 + 1));
    JAVASCRIPT
      original = Process.method(:waitpid2)
      _replace_singleton_method(Process, :waitpid2, ->(pid, _flags) { original.call(pid) }) do
        _assert_code("PREPARATION") { tools.validate(kind: "source", value: {}) }
      end
    end
  end

  def test_heartbeat_is_called_while_waiting_and_releases_the_child_without_waiting_five_seconds
    _with_adapter(<<~JAVASCRIPT) do |tools, root|
      import {existsSync, writeFileSync} from "node:fs";
      const timer = setInterval(() => {
        if (!existsSync("heartbeat")) return;
        writeFileSync(process.argv[process.argv.indexOf("--output") + 1], "true");
        clearInterval(timer);
      }, 5);
    JAVASCRIPT
      original = Process.method(:clock_gettime)
      owner = Thread.current
      advances = 0
      clock = lambda do |*arguments|
        advances += 5 if Thread.current == owner
        original.call(*arguments) + (Thread.current == owner ? advances : 0)
      end
      calls = 0
      _replace_singleton_method(Process, :clock_gettime, clock) do
        assert_equal true, tools.verify_archive_and_extract_landmarks(checkpoint: {}, work_directory: root, deadline_at: 123, heartbeat: lambda {
          calls += 1
          File.write(File.join(root, "heartbeat"), "renewed")
        })
      end
      assert_operator calls, :>=, 1
    end
  end

  private

  def _identities_fixture
    JSON.parse(File.read(File.expand_path("../../build/data/fixtures/source-identities.json", __dir__), encoding: "UTF-8"))
  end

  def _fake_tools(&execute)
    Cataqui::Mapshot::DomainTools.new(environment: "staging", execute: execute)
  end

  def _respond(input:, value:, success: true)
    File.write(input.fetch(:output), JSON.generate(value))
    success
  end

  def _assert_code(code)
    error = assert_raises(Cataqui::Mapshot::SourceImportError) { yield }
    assert_equal code, error.code
    assert_equal "The source import did not complete.", error.message
    error
  end

  def _with_adapter(source)
    Dir.mktmpdir("mapshot-domain-adapter-test-", "/tmp") do |root|
      directory = File.join(root, "dist/tools")
      FileUtils.mkdir_p(directory, mode: 0o700)
      script = File.join(directory, "domain-data.mjs")
      File.write(script, source, mode: "w", perm: 0o500)
      tools = Cataqui::Mapshot::DomainTools.new(
        environment: "production", application_root: root, variables: {"DOMAIN_TEST_MARKER" => "private environment value"}
      )
      yield tools, root
    end
  end

  def _with_waiting_adapter(&block)
    _with_adapter(<<~JAVASCRIPT, &block)
      import {writeFileSync} from "node:fs";
      writeFileSync("child.pid", String(process.pid));
      setInterval(() => {}, 1000);
    JAVASCRIPT
  end

  def _wait_for_pid(root:)
    deadline = Process.clock_gettime(Process::CLOCK_MONOTONIC) + 5
    path = File.join(root, "child.pid")
    until File.exist?(path)
      raise "Fixture child did not start." if Process.clock_gettime(Process::CLOCK_MONOTONIC) >= deadline

      sleep 0.01
    end
    Integer(File.read(path))
  end

  def _replace_singleton_method(object, name, replacement)
    original = object.method(name)
    object.define_singleton_method(name, replacement)
    yield
  ensure
    object.define_singleton_method(name, original)
  end
end
