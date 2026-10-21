# frozen_string_literal: true

require_relative "../../test/test_helper"
require "json"
require "tmpdir"
require_relative "download-index"

class MapshotIndexDownloadTest < Minitest::Test
  #: () -> void
  def setup
    @_directory = Dir.mktmpdir("mapshot-index-download-")
    @_destination = File.join(@_directory, "manifest.json")
    @_environment = ENV.to_h
    _set_r2_environment(values: {})
  end

  #: () -> void
  def teardown
    ENV.replace(@_environment)
    FileUtils.remove_entry(@_directory)
  end

  #: () -> void
  def test_streams_sdk_chunks_without_buffering_the_object
    requests = []
    client = _client(chunks: ["ab", "c"], requests: requests)
    _download(client: client)

    assert_equal "abc", File.binread(@_destination)
    assert_equal [{bucket: "staging", key: "source/indexes/v1/manifest.json"}], requests
    assert_equal ["manifest.json"], Dir.children(@_directory)
    assert_equal 0o644, File.stat(@_destination).mode & 0o777
  end

  #: () -> void
  def test_uses_the_official_sdk_streaming_api_without_a_live_request
    client = Aws::S3::Client.new(region: "auto", stub_responses: true)
    client.stub_responses(:get_object, {body: "abc", content_length: 3})
    _download(client: client)

    assert_equal "abc", File.read(@_destination)
    assert_equal :get_object, client.api_requests.fetch(0).fetch(:operation_name)
  end

  #: () -> void
  def test_rejects_sdk_bytes_beyond_the_manifest_limit_before_writing_them
    assert_raises(MapshotIndexDownload::Failure) { _download(client: _client(chunks: ["123456789"])) }
    assert File.zero?(@_destination)
  end

  #: () -> void
  def test_leaves_partial_sdk_bytes_in_the_caller_owned_staging_directory_when_the_provider_fails
    client = _client(chunks: ["a"], error: RuntimeError.new("credential-bearing provider error"))
    error = assert_raises(MapshotIndexDownload::Failure) { _download(client: client) }
    refute_match "credential-bearing", error.message
    assert_nil error.cause
    assert_equal "a", File.binread(@_destination)
  end

  #: () -> void
  def test_bounds_the_entire_sdk_download_including_a_stalled_stream
    client = Object.new
    client.define_singleton_method(:get_object) do |**_request, &stream|
      stream.call("a")
      sleep 3
    end
    original = Timeout.method(:timeout)
    timeouts = []
    Timeout.define_singleton_method(:timeout) do |seconds, &operation|
      timeouts.push(seconds)
      original.call(0.05, &operation)
    end
    assert_raises(MapshotIndexDownload::Failure) { _download(client: client) }
    assert_equal [180], timeouts
    assert_equal "a", File.binread(@_destination)
  ensure
    Timeout.define_singleton_method(:timeout, original)
  end

  #: () -> void
  def test_preserves_existing_destinations_for_each_transport
    [true, false].each do |sdk|
      File.write(@_destination, "existing")
      client = sdk ? _client(chunks: ["abc"]) : nil
      _write_wrangler(code: "process.stdout.write('abc');") unless sdk
      assert_raises(Errno::EEXIST) { _download(client: client) }
      assert_equal "existing", File.read(@_destination)
      File.unlink(@_destination)
    end
  end

  #: () -> void
  def test_does_not_follow_an_existing_destination_symlink
    target = File.join(@_directory, "owned.json")
    File.write(target, "existing")
    File.symlink(target, @_destination)
    assert_raises(Errno::EEXIST) { _download(client: _client(chunks: ["abc"])) }
    assert_equal "existing", File.read(target)
    assert File.symlink?(@_destination)
  end

  #: () -> void
  def test_creates_missing_staging_directories
    destination = File.join(@_directory, "nested", "index.json")
    _download(client: _client(chunks: ["abc"]), destination: destination)
    assert_equal "abc", File.read(destination)
  end

  #: () -> void
  def test_preserves_an_existing_file_when_the_parent_directory_cannot_be_created
    File.write(@_destination, "existing")
    assert_raises(Errno::EEXIST) do
      _download(client: _client(chunks: ["abc"]), destination: File.join(@_destination, "manifest.json"))
    end
    assert_equal "existing", File.read(@_destination)
  end

  #: () -> void
  def test_streams_wrangler_stdout_and_discards_diagnostics
    arguments = File.join(@_directory, "arguments.json")
    _write_wrangler(code: "import fs from 'node:fs'; fs.writeFileSync(#{JSON.generate(arguments)}, JSON.stringify(process.argv.slice(2))); process.stderr.write('private diagnostic'); process.stdout.write('abc');")
    _download(client: nil)

    assert_equal "abc", File.read(@_destination)
    assert_equal ["r2", "object", "get", "staging/source/indexes/v1/manifest.json", "--remote", "--pipe"], JSON.parse(File.read(arguments))
  end

  #: () -> void
  def test_streams_wrangler_large_archive_keys_with_a_large_bounded_limit
    _write_wrangler(code: "process.stdout.write('abc');")
    MapshotIndexDownload.new(application_root: @_directory).download(
      bucket: "staging", key: "source/import/attempts/owned/#{'a' * 64}/references/landmarks.pmtiles",
      destination: @_destination, maximum_bytes: 316 * 1024 * 1024
    )
    assert_equal "abc", File.read(@_destination)
  end

  #: () -> void
  def test_rejects_wrangler_excess_bytes_before_writing_them
    _write_wrangler(code: "process.stdout.write('too-many-bytes');")
    error = assert_raises(MapshotIndexDownload::Failure) { _download(client: nil) }
    assert_match "limit", error.message
    assert File.zero?(@_destination)
  end

  #: () -> void
  def test_rejects_wrangler_failure_without_exposing_provider_output
    _write_wrangler(code: "process.stdout.write('a'); process.stderr.write('secret-provider-error'); process.exitCode=1;")
    error = assert_raises(MapshotIndexDownload::Failure) { _download(client: nil) }
    refute_match "secret-provider", error.message
    assert_equal "a", File.read(@_destination)
  end

  #: () -> void
  def test_streams_wrangler_diagnostics_without_rejecting_a_valid_object
    _write_wrangler(code: "process.stderr.write(Buffer.alloc(1024 * 1024)); process.stdout.write('abc');")
    _download(client: nil)

    assert_equal "abc", File.read(@_destination)
  end

  #: () -> void
  def test_terminates_a_wrangler_process_even_if_it_handles_sigterm_with_success
    _write_wrangler(code: "process.on('SIGTERM', () => process.exit(0)); process.stdout.write('abc'); setInterval(() => {}, 1000);")
    _expire_wrangler_deadline_after_read do
      assert_raises(MapshotIndexDownload::Failure) { _download(client: nil) }
    end
    assert_equal "abc", File.read(@_destination)
  end

  #: () -> void
  def test_terminates_descendants_when_the_wrangler_launcher_is_running_or_exited
    [false, true].each do |exit_launcher|
      child_marker = File.join(@_directory, "child-finished")
      child = "setTimeout(() => {require('fs').writeFileSync(#{JSON.generate(child_marker)}, 'unexpected'); process.exit(0);}, 600); process.stdout.write('abc');"
      _write_wrangler(code: "import {spawn} from 'node:child_process'; const child=spawn(process.execPath, ['-e', #{JSON.generate(child)}], {stdio:['ignore','inherit','inherit']}); #{exit_launcher ? 'process.exit(0);' : 'child.on("exit", code => process.exit(code ?? 0));'}")
      start = Process.clock_gettime(Process::CLOCK_MONOTONIC)
      _expire_wrangler_deadline_after_read do
        assert_raises(MapshotIndexDownload::Failure) { _download(client: nil) }
      end
      assert_operator Process.clock_gettime(Process::CLOCK_MONOTONIC) - start, :<, 0.5
      sleep 0.65
      refute File.exist?(child_marker)
      assert_equal "abc", File.read(@_destination)
      File.unlink(@_destination)
    end
  end

  #: () -> void
  def test_reports_when_wrangler_cannot_start
    missing = File.join(@_directory, "missing-root")
    downloader = MapshotIndexDownload.new(application_root: missing)
    assert_raises(MapshotIndexDownload::Failure) do
      downloader.download(bucket: "staging", key: "key", destination: @_destination, maximum_bytes: 8)
    end
    assert File.zero?(@_destination)
  end

  #: () -> void
  def test_selects_wrangler_without_s3_credentials
    root = File.join(@_directory, "app")
    path = File.join(root, "node_modules/wrangler/bin/wrangler.js")
    FileUtils.mkdir_p(File.dirname(path))
    File.write(path, "process.stdout.write('abc');")
    MapshotIndexDownload.from_environment(application_root: root).download(
      bucket: "staging", key: "key", destination: @_destination, maximum_bytes: 8
    )
    assert_equal "abc", File.read(@_destination)
  end

  #: () -> void
  def test_rejects_incomplete_s3_credentials
    [{"MAPSHOT_R2_ACCESS_KEY_ID" => "access"}, {"MAPSHOT_R2_SECRET_ACCESS_KEY" => "secret"},
      {"MAPSHOT_R2_ACCESS_KEY_ID" => "", "MAPSHOT_R2_SECRET_ACCESS_KEY" => "secret"}].each do |environment|
      _set_r2_environment(values: environment)
      assert_raises(ArgumentError) { MapshotIndexDownload.from_environment(application_root: @_directory) }
    end
  end

  #: () -> void
  def test_rejects_invalid_implicit_s3_account
    [nil, "wrong-account"].each do |account|
      environment = _environment.merge("CLOUDFLARE_ACCOUNT_ID" => account)
      _set_r2_environment(values: environment)
      assert_raises(ArgumentError) { MapshotIndexDownload.from_environment(application_root: @_directory) }
    end
  end

  #: () -> void
  def test_rejects_invalid_s3_endpoints
    ["http://example.com", "https://user:secret@example.com", "https://", "not a URL"].each do |endpoint|
      environment = _environment.merge("MAPSHOT_R2_ENDPOINT" => endpoint)
      _set_r2_environment(values: environment)
      assert_raises(ArgumentError) { MapshotIndexDownload.from_environment(application_root: @_directory) }
    end
  end

  #: () -> void
  def test_builds_supported_r2_clients_with_bounded_network_settings
    constructed = []
    original = Aws::S3::Client.method(:new)
    singleton = Aws::S3::Client.singleton_class
    owned = singleton.instance_methods(false).include?(:new)
    fake = _client(chunks: ["abc"])
    singleton.remove_method(:new) if owned
    Aws::S3::Client.define_singleton_method(:new) do |**settings|
      constructed << settings
      fake
    end
    begin
      [nil, "https://explicit.r2.cloudflarestorage.com"].each do |endpoint|
        environment = _environment
        environment["MAPSHOT_R2_ENDPOINT"] = endpoint if endpoint
        _set_r2_environment(values: environment)
        MapshotIndexDownload.from_environment(application_root: @_directory).download(
          bucket: "staging", key: "key", destination: @_destination, maximum_bytes: 8
        )
        assert_equal "abc", File.read(@_destination)
        File.unlink(@_destination)
      end
    ensure
      singleton.remove_method(:new)
      Aws::S3::Client.define_singleton_method(:new, original) if owned
    end
    assert_equal "https://#{'a' * 32}.r2.cloudflarestorage.com", constructed.first.fetch(:endpoint)
    assert_equal "https://explicit.r2.cloudflarestorage.com", constructed.last.fetch(:endpoint)
    constructed.each do |settings|
      assert_equal "auto", settings.fetch(:region)
      assert_equal "standard", settings.fetch(:retry_mode)
      refute settings.key?(:max_attempts)
      assert_equal 15, settings.fetch(:http_open_timeout)
      assert_equal 60, settings.fetch(:http_read_timeout)
      assert_equal "access", settings.fetch(:credentials).credentials.access_key_id
    end
  end

  private

  #: (client: Aws::S3::Client?, ?destination: String, ?maximum_bytes: Integer) -> void
  def _download(client:, destination: @_destination, maximum_bytes: 8)
    MapshotIndexDownload.new(application_root: @_directory, client: client).download(
      bucket: "staging", key: "source/indexes/v1/manifest.json", destination: destination, maximum_bytes: maximum_bytes
    )
  end

  #: () { () -> void } -> void
  def _expire_wrangler_deadline_after_read
    original_clock = Process.method(:clock_gettime)
    original_select = IO.method(:select)
    elapsed = 0
    waits = []
    Process.define_singleton_method(:clock_gettime) do |clock, *arguments|
      clock == Process::CLOCK_MONOTONIC ? elapsed : original_clock.call(clock, *arguments)
    end
    IO.define_singleton_method(:select) do |readers, writers, errors, timeout|
      waits.push(timeout)
      original_select.call(readers, writers, errors, 5).tap { elapsed = 10 * 60 }
    end
    yield
    assert_equal [10 * 60], waits
  ensure
    Process.define_singleton_method(:clock_gettime, original_clock)
    IO.define_singleton_method(:select, original_select)
  end

  #: (chunks: Array[String], ?requests: Array[Hash[Symbol, String]], ?error: StandardError?) -> Object
  def _client(chunks:, requests: [], error: nil)
    client = Object.new
    client.define_singleton_method(:get_object) do |**request, &stream|
      requests << request
      chunks.each { |chunk| stream.call(chunk) }
      raise error if error

      nil
    end
    client
  end

  #: (code: String) -> void
  def _write_wrangler(code:)
    path = File.join(@_directory, "node_modules/wrangler/bin/wrangler.js")
    FileUtils.mkdir_p(File.dirname(path))
    File.write(path, code)
  end

  #: (values: Hash[String, String?]) -> void
  def _set_r2_environment(values:)
    ["MAPSHOT_R2_ACCESS_KEY_ID", "MAPSHOT_R2_SECRET_ACCESS_KEY", "MAPSHOT_R2_ENDPOINT", "CLOUDFLARE_ACCOUNT_ID"].each { |key| ENV.delete(key) }
    ENV.update(values)
  end

  #: () -> Hash[String, String]

  def _environment
    {"MAPSHOT_R2_ACCESS_KEY_ID" => "access", "MAPSHOT_R2_SECRET_ACCESS_KEY" => "secret", "CLOUDFLARE_ACCOUNT_ID" => "a" * 32}
  end
end
