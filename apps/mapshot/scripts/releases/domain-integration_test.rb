# frozen_string_literal: true

require_relative "../../test/test_helper"
require_relative "../../test/bundle-fixture"
require "base64"
require "digest"
require "fileutils"
require "json"
require "open3"
require "rbconfig"
require "tmpdir"
require_relative "../../build/build-mapshot"
require_relative "domain-tools"
require_relative "../source/promotion/promotion-inventory.service"

# Exercise real process boundaries and production schemas. Only object storage is
# in memory; every Node executable is compiled into a private, fresh app directory.
class MapshotDomainIntegrationTest < Minitest::Test
  class Storage
    attr_reader :objects, :reads, :writes

    def initialize(objects:)
      @objects = objects
      @reads = []
      @writes = []
    end

    def head_object(key:, timeout:, signal:)
      signal&.check!
      raise "A positive storage deadline is required." unless timeout.positive?

      object = objects[key]
      return {"kind" => "missing"} unless object

      {"kind" => "object", "bytes" => object.fetch("bytes").bytesize,
       "etag" => object.fetch("etag"), "sha256" => Digest::SHA256.hexdigest(object.fetch("bytes")),
       "contentType" => "application/octet-stream"}
    end

    def read_range(key:, offset:, length:, etag:, timeout:, signal:)
      signal&.check!
      raise "A positive storage deadline is required." unless timeout.positive?

      object = objects.fetch(key)
      raise "Conditional read did not match." unless etag == object.fetch("etag")

      reads.push(key)
      object.fetch("bytes").byteslice(offset, length)
    end

    def put_raw(key:, bytes:, content_type:, timeout:, signal:)
      signal&.check!
      raise "Unexpected metadata write." unless timeout.positive? && content_type == "application/json"
      raise "Immutable metadata changed." if objects.key?(key) && objects.fetch(key).fetch("bytes") != bytes

      objects[key] = {"bytes" => bytes, "etag" => Digest::SHA256.hexdigest(bytes)}
      writes.push(key)
    end
  end

  class << self
    def compiled_fixture
      return @_fixture if @_fixture

      directory = Dir.mktmpdir("mapshot-domain-integration-")
      Minitest.after_run { FileUtils.remove_entry(directory) }
      root = File.expand_path("../..", __dir__)
      %w[src build node_modules test rspack.config.ts].each { |name| File.symlink(File.join(root, name), File.join(directory, name)) }
      # Copy only operational Ruby sources so the real CLI resolves this private
      # app's tooling, without writing to or relying on the checkout's dist files.
      Dir.glob(File.join(root, "scripts/**/*.rb")).reject { |path| path.end_with?("_test.rb") }.each do |path|
        destination = File.join(directory, path.delete_prefix("#{root}/"))
        FileUtils.mkdir_p(File.dirname(destination))
        FileUtils.cp(path, destination)
      end
      MapshotExecutableBuild.new(application_root: directory).build(tools: true)
      executable = File.join(directory, "dist/tools/domain-integration.fixture.mjs")
      MapshotBundleFixture.build(entry: File.join(root, "test/node/domain-integration.fixture.ts"),
        output: executable, external_packages: true)
      output, errors, status = Open3.capture3("node", executable, chdir: directory)
      raise "Mapshot's real tiny map fixture failed: #{errors}" unless status.success?

      @_fixture = {root: directory, value: JSON.parse(output)}
    end
  end

  def setup
    compiled = self.class.compiled_fixture
    @_root = compiled.fetch(:root)
    @_fixture = Marshal.load(Marshal.dump(compiled.fetch(:value)))
    @_identities = JSON.parse(File.read(File.join(__dir__, "../../build/data/fixtures/source-identities.json")))
    @_domain = Cataqui::Mapshot::DomainTools.new(environment: "staging", application_root: @_root)
  end

  def test_ruby_inventory_matches_real_node_manifest_and_promotion_contracts
    source = @_domain.validate(kind: "source", value: @_fixture.fetch("source"))
    archive = source.fetch("release").fetch("pmtiles")
    objects = @_fixture.fetch("objects").to_h do |object|
      key = object.fetch("key")
      bytes = Base64.strict_decode64(object.fetch("body"))
      [key, {"bytes" => bytes, "etag" => key == archive.fetch("objectKey") ? archive.fetch("etag") : Digest::SHA256.hexdigest(bytes)}]
    end
    storage = Storage.new(objects: objects)
    repository = Cataqui::Mapshot::PromotionInventoryService.new(source: storage, destination: storage, domain: @_domain)

    reference = repository.build(id: @_identities.fetch("integrationExpected").fetch("fingerprint"), source: source, timeout: 30)
    root = _metadata(storage: storage, reference: reference, kind: "promotion-manifest")
    assets = root.fetch("pages").flat_map do |page|
      _metadata(storage: storage, reference: page, kind: "promotion-page").fetch("assets")
    end

    assert_equal objects.keys.reject { |key| key.start_with?("source/promotions/") }.sort, (assets.map { |asset| asset.fetch("key") })
    refute_includes storage.reads, archive.fetch("objectKey")
    refute_includes storage.reads, source.fetch("release").fetch("references").fetch("catalogueKey")
    assert_equal reference, repository.build(id: @_identities.fetch("integrationExpected").fetch("fingerprint"), source: source, timeout: 30)
  end

  def test_release_data_cli_uses_real_composition_and_preserves_the_source_fingerprint
    result = _release_cli(source: @_fixture.fetch("source"))

    assert result.fetch(:status).success?, result.fetch(:errors)
    assert_empty result.fetch(:stdout)
    assert_empty result.fetch(:errors)
    assert_equal @_identities.fetch("integrationExpected").fetch("fingerprint"), result.fetch(:value)
    assert_equal 0o600, result.fetch(:mode)
  end

  def test_release_data_cli_rejects_a_source_whose_prepared_archive_does_not_match
    source = @_fixture.fetch("source")
    source.fetch("prepared")["archiveId"] = "0" * 64
    result = _release_cli(source: source)

    assert_equal 1, result.fetch(:status).exitstatus
    assert_nil result.fetch(:value)
    assert_equal "Mapshot data command failed; provider details were suppressed to protect credentials.\n", result.fetch(:errors)
  end

  def test_import_validation_uses_the_authoritative_job_schema_and_field_order
    job = @_fixture.fetch("importJob").to_a.reverse.to_h
    result = @_domain.validate(kind: "import-job", value: job)

    assert_equal @_fixture.fetch("importJob"), result
    assert_equal @_fixture.fetch("importJob").keys, result.keys
  end

  def test_import_validation_normalizes_integral_decimal_and_exponent_inputs
    job = @_fixture.fetch("importJob")
    archive = job.fetch("archive")
    archive["bytes"] = archive.fetch("bytes").to_f
    archive["observedAt"] = 1e3

    result = @_domain.validate(kind: "import-job", value: job)

    assert_instance_of Integer, result.fetch("archive").fetch("bytes")
    assert_instance_of Integer, result.fetch("archive").fetch("observedAt")
    assert_equal @_fixture.fetch("importJob"), result
  end

  #: () -> void
  def test_release_validation_normalizes_integral_numbers_at_the_node_boundary
    source = @_identities.fetch("release").to_a.reverse.to_h
    source.fetch("pmtiles")["bytes"] = 127.0

    release = @_domain.validate(kind: "source-release", value: source)

    assert_equal @_identities.fetch("release"), release
    assert_instance_of Integer, release.fetch("pmtiles").fetch("bytes")
  end

  #: () -> void
  def test_release_validation_preserves_unicode_and_control_character_encoding
    source = @_identities.fetch("unicodeRelease")
    release = @_domain.validate(kind: "source-release", value: source)

    assert_equal source, release
  end

  #: () -> void
  def test_release_validation_rejects_unowned_fields
    [
      @_identities.fetch("release").merge("privateExtra" => "untrusted"),
      @_identities.fetch("release").merge("id" => "f" * 64)
    ].each do |source|
      error = assert_raises(Cataqui::Mapshot::SourceImportError) { @_domain.validate(kind: "source-release", value: source) }
      assert_equal "INVALID_INPUT", error.code
    end
  end

  #: () -> void
  def test_promotion_page_limit_comes_from_the_authoritative_domain_contract
    assert_equal 100, @_domain.promotion_page_asset_limit
  end

  private

  def _metadata(storage:, reference:, kind:)
    bytes = storage.objects.fetch(reference.fetch("key")).fetch("bytes")
    assert_equal reference.fetch("bytes"), bytes.bytesize
    assert_equal reference.fetch("sha256"), Digest::SHA256.hexdigest(bytes)
    value = JSON.parse(bytes)
    assert_equal value, @_domain.validate(kind: kind, value: value)
    value
  end

  def _release_cli(source:)
    Dir.mktmpdir("mapshot-release-cli-") do |directory|
      output = File.join(directory, "result.json")
      stdout, errors, status = Open3.capture3(
        {"CLOUDFLARE_ACCOUNT_ID" => "a" * 32, "MAPSHOT_R2_ACCESS_KEY_ID" => "offline-access",
         "MAPSHOT_R2_SECRET_ACCESS_KEY" => "offline-secret", "AWS_EC2_METADATA_DISABLED" => "true"},
        RbConfig.ruby, File.join(@_root, "scripts/releases/release-data.rb"), "--output", output,
        stdin_data: JSON.generate({"operation" => "reservations.fingerprint", "environment" => "staging", "source" => source}),
        chdir: @_root
      )
      {stdout: stdout, errors: errors, status: status, value: File.exist?(output) ? JSON.parse(File.read(output)) : nil,
       mode: File.exist?(output) ? File.stat(output).mode & 0o777 : nil}
    end
  end
end
