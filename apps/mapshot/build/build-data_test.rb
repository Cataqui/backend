# frozen_string_literal: true

require_relative '../test/test_helper'
require 'fileutils'
require 'rbconfig'
require 'tmpdir'
require_relative 'build-data'
require_relative '../test/bundle-fixture'

class MapshotBuildDataTest < Minitest::Test
  #: () -> void
  def test_bundled_source_contract_rejects_a_mismatched_archive
    _with_adapter do |validator, root|
      candidate = _fixture(root: root).fetch('candidate')
      assert_equal candidate, validator.validate(kind: 'source', value: candidate)

      candidate.fetch('prepared')['archiveId'] = 'f' * 64
      error = assert_raises(MapshotBuildData::InvalidData) { validator.validate(kind: 'source', value: candidate) }
      assert_equal 'Mapshot build data validation failed.', error.message
    end
  end

  #: () -> void
  def test_bundled_manifest_contract_returns_the_owned_files_and_rejects_stale_data
    _with_adapter do |validator, root|
      fixture = _fixture(root: root)
      result = validator.validate(kind: 'index-manifest', value: fixture.fetch('manifest'))
      assert_equal fixture.fetch('manifest'), result.fetch('manifest')
      assert_equal fixture.fetch('files'), result.fetch('files')

      error = assert_raises(MapshotBuildData::InvalidData) do
        validator.validate(kind: 'index-manifest', value: fixture.fetch('manifest').merge('legacy' => true))
      end
      assert_equal 'Mapshot build data validation failed.', error.message
    end
  end

  #: () -> void
  def test_compiled_adapter_is_required_without_a_source_fallback
    Dir.mktmpdir('mapshot-build-data-missing-', '/tmp') do |root|
      error = assert_raises(MapshotBuildData::InvalidData) do
        MapshotBuildData.new(application_root: root).validate(kind: 'source', value: {})
      end
      assert_equal 'Mapshot build data validation failed.', error.message
      refute_includes error.message, root
    end
  end

  #: () -> void
  def test_invalid_adapter_output_does_not_expose_process_details
    _with_node("STDOUT.write('private invalid adapter output'); STDERR.write('private process diagnostics')") do
      error = assert_raises(MapshotBuildData::InvalidData) do
        MapshotBuildData.new.validate(kind: 'source', value: {})
      end
      assert_equal 'Mapshot build data validation failed.', error.message
    end
  end

  #: () -> void
  def test_process_launch_failures_are_sanitized
    original = ENV.fetch('PATH')
    ENV['PATH'] = ''
    error = assert_raises(MapshotBuildData::InvalidData) do
      MapshotBuildData.new.validate(kind: 'source', value: {})
    end
    assert_equal 'Mapshot build data validation failed.', error.message
  ensure
    ENV['PATH'] = original
  end

  private

  #: () { (MapshotBuildData, String) -> void } -> void
  def _with_adapter
    Dir.mktmpdir('mapshot-build-data-', '/tmp') do |root|
      directory = File.join(root, 'dist/tools')
      FileUtils.mkdir_p(directory)
      MapshotBundleFixture.build(entry: File.join(__dir__, 'build-data.ts'),
                                 output: File.join(directory, 'build-data.mjs'))
      yield MapshotBuildData.new(application_root: root), root
    end
  end

  #: (root: String) -> Hash[String, Object]
  def _fixture(root:)
    fixture = File.join(root, 'fixture.mjs')
    MapshotBundleFixture.build(input: <<~TYPESCRIPT, output: fixture)
      import { createDeploymentCandidate } from #{JSON.generate(File.expand_path('../test/basemap-deployment.fixture.ts', __dir__))};
      import { createIndexFixture } from #{JSON.generate(File.expand_path('../test/basemap-index.fixture.ts', __dir__))};
      import { getBasemapIndexFiles } from #{JSON.generate(File.expand_path('../src/tiles/sources/indexes/basemap-index-manifest.ts', __dir__))};
      const fixture = await createIndexFixture();
      const files = getBasemapIndexFiles({manifest: fixture.manifest});
      process.stdout.write(JSON.stringify({ candidate: createDeploymentCandidate(), manifest: fixture.manifest, files: files }));
    TYPESCRIPT
    output, error, status = Open3.capture3('node', fixture)
    assert status.success?, error
    JSON.parse(output)
  end

  #: (String) { () -> void } -> void
  def _with_node(program)
    original = ENV.fetch('PATH')
    Dir.mktmpdir('mapshot-build-node-', '/tmp') do |directory|
      node = File.join(directory, 'node')
      File.write(node, "#!#{RbConfig.ruby}\n#{program}\n")
      File.chmod(0o700, node)
      ENV['PATH'] = directory
      yield
    ensure
      ENV['PATH'] = original
    end
  end
end
