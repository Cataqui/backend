# frozen_string_literal: true

require_relative "test_helper"
require "rbconfig"
require "pty"
require "stringio"
require "tmpdir"
require_relative "../bootstrap-runtime"

class InfrastructureBootstrapRuntimeTest < Minitest::Test
  def setup
    Bootstrap::KNOWN_SECRETS.clear
  end

  def teardown
    Bootstrap::KNOWN_SECRETS.clear
    Bootstrap.instance_variable_set(:@active_phase, nil)
  end

  def _with_stub(target, name, handler)
    original = target.method(name)
    target.define_singleton_method(name) { |*args, **options, &block| handler.call(*args, **options, &block) }
    yield
  ensure
    target.define_singleton_method(name, original)
  end

  def _control(events)
    control = Object.new
    [:auto_spin, :success, :error, :pause, :resume].each do |name|
      control.define_singleton_method(name) { events << [name, nil] }
    end
    control.define_singleton_method(:update) { |title:| events << [:update, title] }
    control
  end

  def test_subprocess_arguments_are_literal_and_environment_is_replaced
    previous = ENV["CATAQUI_BOOTSTRAP_RUNTIME_TEST"]
    ENV["CATAQUI_BOOTSTRAP_RUNTIME_TEST"] = "must-not-inherit"
    argument = '$(printf should-not-execute); `printf should-not-execute`'
    result = Bootstrap.run_async(RbConfig.ruby, ["-rjson", "-e", "puts JSON.generate([ARGV[0], ENV['CATAQUI_BOOTSTRAP_RUNTIME_TEST']])", argument], env: {})
    assert_equal [argument, nil], JSON.parse(result.fetch("stdout"))
    assert_equal 0, result.fetch("status")
  ensure
    ENV["CATAQUI_BOOTSTRAP_RUNTIME_TEST"] = previous
  end

  def test_provider_cli_json_is_utf8_even_when_local_default_encoding_is_ascii
    previous = Encoding.default_external
    Encoding.default_external = Encoding::US_ASCII
    payload = JSON.generate({"name" => "Cataquí"})
    command = "STDOUT.write([ARGV[0]].pack('H*'))"
    result = Bootstrap.run_async(RbConfig.ruby, ["-e", command, payload.unpack1("H*")])
    assert_equal Encoding::UTF_8, result.fetch("stdout").encoding
    assert_equal({"name" => "Cataquí"}, JSON.parse(result.fetch("stdout")))
  ensure
    Encoding.default_external = previous
  end

  def test_subprocess_failure_redacts_registered_secrets
    secret = "generated-runtime-secret"
    Bootstrap::KNOWN_SECRETS.add(secret)
    error = assert_raises(RuntimeError) do
      Bootstrap.run_async(RbConfig.ruby, ["-e", "warn ARGV[0]; exit 7", secret])
    end
    assert_includes error.message, "[REDACTED]"
    refute_includes error.message, secret
  end

  def test_allowed_failure_preserves_exit_status_and_diagnostics_for_classification
    result = Bootstrap.run_async(RbConfig.ruby, ["-e", "puts 'provider-output'; warn 'provider-error'; exit 7"], allow_failure: true)
    assert_equal 7, result.fetch("status")
    assert_equal "provider-output\n", result.fetch("stdout")
    assert_equal "provider-error\n", result.fetch("stderr")
  end

  def test_missing_executable_returns_a_scoped_failure
    error = assert_raises(RuntimeError) { Bootstrap.run_async("/no-such-cataqui-bootstrap-command", []) }
    assert_match(/Unable to execute/, error.message)
  end

  def test_subprocess_working_directory_and_input_are_explicit
    Dir.mktmpdir("cataqui-bootstrap-test-") do |directory|
      result = Bootstrap.run_async(RbConfig.ruby, ["-rjson", "-e", "puts JSON.generate([Dir.pwd, STDIN.read])"],
                                   cwd: directory, input: "owned-input")
      assert_equal [File.realpath(directory), "owned-input"], JSON.parse(result.fetch("stdout"))
    end
  end

  def test_inherited_subprocess_returns_its_status
    result = Bootstrap.run_async(RbConfig.ruby, ["-e", "exit 4"], inherit: true, allow_failure: true)
    assert_equal({"status" => 4, "stdout" => "", "stderr" => ""}, result)
  end

  def test_tool_probe_uses_supplied_version_arguments
    result = Bootstrap.require_tool_async(RbConfig.ruby, ["-e", "print RUBY_VERSION"])
    assert_equal RUBY_VERSION, result.fetch("stdout")
  end

  def test_local_lock_excludes_another_process_and_releases_after_owner_closes
    release = Bootstrap.acquire_lock
    code = <<~RUBY
      require #{File.expand_path('../bootstrap-runtime', __dir__).inspect}
      begin
        release = Bootstrap.acquire_lock
        release.call
        puts 'acquired'
      rescue => error
        warn error.message
        exit 3
      end
    RUBY
    blocked = Bootstrap.run_async(RbConfig.ruby, ["-e", code], allow_failure: true)
    assert_equal 3, blocked.fetch("status")
    assert_includes blocked.fetch("stderr"), "already running as process #{Process.pid}"
    release.call
    assert_equal "acquired\n", Bootstrap.run_async(RbConfig.ruby, ["-e", code]).fetch("stdout")
  ensure
    release&.call
  end

  def test_lock_symlink_cannot_overwrite_another_file
    Dir.mktmpdir("cataqui-lock-test-") do |directory|
      target = File.join(directory, "owned-fixture")
      File.write(target, "preserve fixture contents")
      File.symlink(target, File.join(directory, "cataqui-infrastructure-bootstrap.lock"))
      _with_stub(Dir, :tmpdir, -> { directory }) do
        assert_raises(Errno::ELOOP) { Bootstrap.acquire_lock }
      end
      assert_equal "preserve fixture contents", File.read(target, encoding: Encoding::UTF_8)
    end
  end

  def test_lock_hardlink_cannot_overwrite_another_file
    Dir.mktmpdir("cataqui-lock-test-") do |directory|
      target = File.join(directory, "owned-fixture")
      File.write(target, "preserve fixture contents")
      File.link(target, File.join(directory, "cataqui-infrastructure-bootstrap.lock"))
      _with_stub(Dir, :tmpdir, -> { directory }) do
        error = assert_raises(RuntimeError) { Bootstrap.acquire_lock }
        assert_match(/regular file owned by the current user/, error.message)
      end
      assert_equal "preserve fixture contents", File.read(target, encoding: Encoding::UTF_8)
    end
  end

  def test_noninteractive_phase_reports_progress_and_returns_result
    output = StringIO.new
    previous = $stdout
    $stdout = output
    result = Bootstrap.run_bootstrap_phase(pending: "Inspecting owned resource", complete: "Resource verified") { 42 }
    assert_equal 42, result
    assert_equal "Inspecting owned resource...\nResource verified.\n", output.string
  ensure
    $stdout = previous
  end

  def test_bootstrap_ui_explains_scope_and_reports_completion_or_failure
    _with_stub(Bootstrap, :_interactive?, -> { true }) do
      stdout, stderr = capture_io do
        Bootstrap.start_bootstrap_ui
        Bootstrap.log("Inspecting owned resource")
        Bootstrap.finish_bootstrap_ui
        Bootstrap.fail_bootstrap_ui("Provider inspection failed")
      end
      assert_includes stdout, "Reconciles staging and production immediately."
      assert_includes stdout, "Inspecting owned resource"
      assert_includes stdout, "Infrastructure bootstrap is healthy."
      assert_equal "Provider inspection failed\n", stderr
    end
    _with_stub(Bootstrap, :_interactive?, -> { false }) do
      stdout, stderr = capture_io { Bootstrap.start_bootstrap_ui }
      assert_empty stdout
      assert_empty stderr
    end
  end

  def test_noninteractive_credential_request_fails_without_reading_input
    error = assert_raises(RuntimeError) do
      Bootstrap.prompt_hidden(title: "Credential", message: "Credential", guidance: "Use provider console",
                              unavailable_message: "An interactive terminal is required.")
    end
    assert_equal "An interactive terminal is required.", error.message
  end

  def test_provider_requests_reject_unencrypted_urls
    error = assert_raises(RuntimeError) { Bootstrap.http_request("http://example.invalid/") }
    assert_equal "Bootstrap provider requests require HTTPS.", error.message
  end

  def test_provider_http_uses_tls_and_preserves_method_headers_and_body
    response = Struct.new(:code, :body).new("200", '{"healthy":true}')
    requests = []
    http = Object.new
    http.define_singleton_method(:request) { |request| requests << request; response }
    _with_stub(Net::HTTP, :start, lambda { |host, port, use_ssl:, &operation|
      assert_equal "provider.example", host
      assert_equal 443, port
      assert use_ssl
      operation.call(http)
    }) do
      assert_same response, Bootstrap.http_request("https://provider.example/resource?scope=owned", method: "POST",
                                                   headers: {"authorization" => "Bearer test-token"}, body: "payload")
    end
    assert_equal "POST", requests.first.method
    assert_equal "/resource?scope=owned", requests.first.path
    assert_equal "Bearer test-token", requests.first["authorization"]
    assert_equal "payload", requests.first.body
  end

  def test_json_requests_encode_provider_payload_and_support_no_content
    responses = [Struct.new(:code, :body).new("201", '{"id":"owned"}'), Struct.new(:code, :body).new("204", "")]
    calls = []
    _with_stub(Bootstrap, :http_request, lambda { |url, **options|
      calls << [url, options]
      responses.shift
    }) do
      assert_equal({"id" => "owned"}, Bootstrap.request_json("https://provider.example/resource", method: "POST",
                                                             body: {"name" => "owned"}, accepted_statuses: [201]))
      assert_nil Bootstrap.request_json("https://provider.example/resource/owned", method: "DELETE", accepted_statuses: [204])
    end
    assert_equal({"name" => "owned"}, JSON.parse(calls.first.last.fetch(:body)))
    assert_equal "application/json", calls.first.last.fetch(:headers).fetch("content-type")
    assert_nil calls.last.last.fetch(:body)
  end

  def test_provider_json_failures_are_redacted_without_exposing_credential_in_url
    Bootstrap::KNOWN_SECRETS.add("provider-secret-value")
    response = Struct.new(:code, :body).new("403", "credential=provider-secret-value")
    _with_stub(Bootstrap, :http_request, ->(*) { response }) do
      error = assert_raises(RuntimeError) do
        Bootstrap.request_json("https://provider.example/resource?token=provider-secret-value")
      end
      assert_equal "GET /resource failed with 403: credential=[REDACTED]", error.message
    end
  end

  def test_interactive_phase_tracks_progress_and_stops_after_success_or_failure
    require "tty-spinner"
    events = []
    control = _control(events)
    _with_stub(Bootstrap, :_interactive?, -> { true }) do
      _with_stub(TTY::Spinner, :new, ->(*) { control }) do
        assert_equal 42, Bootstrap.run_bootstrap_phase(pending: "Inspecting provider", complete: "Provider ready") {
          Bootstrap.log("Fetching owned resource")
          42
        }
        assert_raises(RuntimeError) do
          Bootstrap.run_bootstrap_phase(pending: "Checking provider", complete: "Provider ready") { raise "Provider failed" }
        end
      end
    end
    assert_includes events, [:update, "Fetching owned resource"]
    assert_includes events, [:success, nil]
    assert_includes events, [:error, nil]
    assert_nil Bootstrap.instance_variable_get(:@active_phase)
  end

  def test_protected_prompt_registers_secret_and_resumes_suspended_progress
    require "tty-prompt"
    events = []
    control = _control(events)
    Bootstrap.instance_variable_set(:@active_phase, {control: control, message: "Provider phase"})
    question = Object.new
    [:required, :validate, :modify].each { |name| question.define_singleton_method(name) { |*| nil } }
    prompt = Object.new
    prompt.define_singleton_method(:mask) { |_message, mask:, &operation| events << [:mask, mask]; operation.call(question); "protected-value" }
    _with_stub(Bootstrap, :_interactive?, -> { true }) do
      _with_stub($stdin, :noecho, ->(&operation) { operation.call }) do
        _with_stub(TTY::Prompt, :new, ->(**) { prompt }) do
          capture_io do
            assert_equal "protected-value", Bootstrap.prompt_hidden(title: "Credential", message: "Paste credential",
                                                                     guidance: "Provider console", unavailable_message: "Unavailable")
          end
        end
      end
    end
    assert Bootstrap::KNOWN_SECRETS.include?("protected-value")
    assert_equal [[:pause, nil], [:mask, "•"], [:resume, nil]], events
  end

  def test_protected_prompt_cancellation_resumes_progress_and_fails_closed
    require "tty-prompt"
    events = []
    Bootstrap.instance_variable_set(:@active_phase, {control: _control(events), message: "Provider phase"})
    prompt = Object.new
    prompt.define_singleton_method(:mask) { |*, **| raise Interrupt }
    _with_stub(Bootstrap, :_interactive?, -> { true }) do
      _with_stub($stdin, :noecho, ->(&operation) { operation.call }) do
        _with_stub(TTY::Prompt, :new, ->(**) { prompt }) do
          capture_io do
            error = assert_raises(RuntimeError) do
              Bootstrap.prompt_hidden(title: "Credential", message: "Paste credential", guidance: "Provider console",
                                      unavailable_message: "Unavailable")
            end
            assert_equal "Infrastructure bootstrap was cancelled.", error.message
          end
        end
      end
    end
    assert_empty Bootstrap::KNOWN_SECRETS
    assert_equal [[:pause, nil], [:resume, nil]], events
  end

  def test_secret_echo_is_disabled_before_prompt_displays_credential_question
    require "tty-prompt"
    echo_disabled = false
    prompt = Object.new
    prompt.define_singleton_method(:mask) do |*, **|
      raise "Credential question rendered before echo was disabled" unless echo_disabled

      "protected-value"
    end
    _with_stub(Bootstrap, :_interactive?, -> { true }) do
      _with_stub($stdin, :noecho, lambda { |&operation|
        echo_disabled = true
        operation.call
      }) do
        _with_stub(TTY::Prompt, :new, ->(**) { prompt }) do
          capture_io do
            assert_equal "protected-value", Bootstrap.prompt_hidden(title: "Credential", message: "Paste credential",
                                                                     guidance: "Provider console", unavailable_message: "Unavailable")
          end
        end
      end
    end
  end

  def test_progress_indicator_keeps_animating_while_provider_cli_is_running
    runtime = File.expand_path("../bootstrap-runtime", __dir__)
    code = <<~RUBY
      require #{runtime.inspect}
      require "rbconfig"
      Bootstrap.run_bootstrap_phase(pending: "Waiting for CLI", complete: "CLI finished") do
        Bootstrap.run_async(RbConfig.ruby, ["-e", "sleep 0.4"])
      end
    RUBY
    output = String.new(encoding: Encoding::UTF_8)
    PTY.spawn(RbConfig.ruby, "-e", code) do |reader, _writer, pid|
      reader.set_encoding(Encoding::UTF_8)
      begin
        output << reader.read
      rescue Errno::EIO
        # A closed pseudo-terminal reports EIO on macOS/Linux.
      end
      Process.wait(pid)
    end
    assert_operator output.scan("Waiting for CLI").length, :>=, 2
    assert_includes output, "CLI finished"
  end
end
