# frozen_string_literal: true

require_relative "../../test/test_helper"
require "fileutils"
require "json"
require "tmpdir"
require_relative "font-assets"

class MapshotFontAssetsTest < Minitest::Test
  #: () -> void
  def setup
    @root = Dir.mktmpdir("mapshot-font-test-", "/tmp")
    FileUtils.mkdir_p(File.join(@root, "build/fonts/assets/sources"))
    {"Inter.ttf" => "variable Inter", "NotoSans.ttc" => "collection", "inter-OFL.txt" => "Inter license",
      "noto-fonts-OFL.txt" => "Noto license", "noto-cjk-OFL.txt" => "CJK license"}.each do |name, bytes|
      File.binwrite(File.join(@root, "build/fonts/assets/sources", name), bytes)
    end
    _write_preparer
    @fonts = MapshotFontAssets.new(application_root: @root)
  end

  #: () -> void
  def teardown
    FileUtils.rm_rf(@root)
  end

  #: () -> void
  def test_prepares_and_packages_fonts_without_geographic_inputs
    FileUtils.rm_rf(File.join(@root, "src/renderer/fonts/assets"))
    @fonts.prepare
    refute _json("fallback-font-set.json").fetch("manifest").key?("regions")
    destination = File.join(@root, "packaged")
    @fonts.package(destination: destination)
    refute File.exist?(File.join(destination, "font-regions.json"))
  end

  #: () -> void
  def test_prepares_qualified_roles_coverage_and_provenance
    @fonts.prepare
    font_set = _json("fallback-font-set.json")
    manifest = font_set.fetch("manifest")
    assert_equal [[65, 66], [8230, 8230]], manifest.fetch("primaryCoverage")
    assert_equal([400, 600, 700], manifest.fetch("fonts").map { |font| font.fetch("weight") })
    assert_equal([[[69, 69]], [[67, 68]], [[70, 70]]], manifest.fetch("fonts").map { |font| font.fetch("ranges") })
    assert_equal "https://raw.githubusercontent.com/Cataqui/backend/main/apps/mapshot/build/fonts/assets/sources/NotoSans.ttc", manifest.fetch("fonts").first.fetch("url")
    assert_equal "Inter-600", File.binread(_generated("inter-semibold.ttf"))
    assert_equal "Inter-400", File.binread(_generated("inter-regular.ttf"))
    assert_equal "Inter-700", File.binread(_generated("inter-bold.ttf"))
    refute(Dir.glob(_generated("**/*")).any? { |path| path.match?(/(?:glyphs|\.pbf\z|inter\.config)/) })
  end

  #: () -> void
  def test_preparation_is_repeatable_without_maintaining_an_extra_cache
    @fonts.prepare
    before = _json("fallback-font-set.json")
    @fonts.prepare
    assert_equal before, _json("fallback-font-set.json")
    assert_equal 2, _invocations
    refute File.exist?(_generated("generation.json"))
    File.binwrite(_generated("inter-semibold.ttf"), "corrupt font")
    @fonts.prepare
    assert_equal "Inter-600", File.binread(_generated("inter-semibold.ttf"))
    File.unlink(_generated("inter-regular.ttf"))
    @fonts.prepare
    assert_equal "Inter-400", File.binread(_generated("inter-regular.ttf"))
  end

  #: () -> void
  def test_missing_required_sources_or_licenses_cannot_publish_assets
    ["Inter.ttf", "inter-OFL.txt", "noto-fonts-OFL.txt", "noto-cjk-OFL.txt"].each do |name|
      path = File.join(@root, "build/fonts/assets/sources", name)
      bytes = File.binread(path)
      File.unlink(path)
      assert_raises(RuntimeError) { @fonts.prepare }
      refute File.exist?(_generated("fallback-font-set.json"))
      File.binwrite(path, bytes)
    end
  end

  #: () -> void
  def test_rejects_empty_licenses
    source = File.join(@root, "build/fonts/assets/sources/inter-OFL.txt")
    File.binwrite(source, "")
    assert_match(/license is empty/, assert_raises(RuntimeError) { @fonts.prepare }.message)
    assert_equal 0, _invocations
  end

  #: () -> void
  def test_ignores_unrelated_files_and_directories_in_source_inputs
    File.binwrite(File.join(@root, "build/fonts/assets/sources/ignored.json"), "ignored")
    FileUtils.mkdir_p(File.join(@root, "build/fonts/assets/sources/nested.ttf"))
    @fonts.prepare
    before = _json("fallback-font-set.json")
    File.binwrite(File.join(@root, "build/fonts/assets/sources/ignored.json"), "changed")
    @fonts.prepare
    assert_equal before, _json("fallback-font-set.json")
  end

  #: () -> void
  def test_python_failure_removes_staged_inputs_and_publishes_no_assets
    File.write(File.join(@root, "build/fonts/prepare-fonts.py"), <<~PYTHON)
      import pathlib, sys
      pathlib.Path(__file__).with_name("staged-directory.txt").write_text(sys.argv[1])
      raise ValueError("invalid variable weight axis")
    PYTHON
    assert_match(/variable weight axis/, assert_raises(RuntimeError) { @fonts.prepare }.message)
    staged = File.read(File.join(@root, "build/fonts/staged-directory.txt"))
    refute File.exist?(staged)
    refute File.exist?(_generated("fallback-font-set.json"))
  end

  #: () -> void
  def test_preserves_collection_face_indexes_and_regional_priority
    _write_preparer(faces: [
      {"source" => "NotoSansCJK.ttc", "family" => "NotoSansCJKjp", "weight" => 400, "faceIndex" => 1, "codepoints" => [65, 0x6771]},
      {"source" => "NotoSansCJK.ttc", "family" => "NotoSansCJKsc", "weight" => 400, "faceIndex" => 0, "codepoints" => [65, 0x6771]},
      {"source" => "NotoSans.ttc", "family" => "NotoSans", "weight" => 400, "codepoints" => [65, 67]}
    ])
    @fonts.prepare
    fonts = _json("fallback-font-set.json").fetch("manifest").fetch("fonts")
    assert_equal(["NotoSans", "NotoSansCJKsc", "NotoSansCJKjp"] * 3, fonts.map { |font| font.fetch("family") })
    assert_equal([0, 1] * 3, fonts.filter_map { |font| font["faceIndex"] })
    assert_equal [[0x6771, 0x6771]], fonts[1].fetch("ranges")
  end

  #: () -> void
  def test_tibetan_semibold_is_reused_across_roles_with_pinned_provenance
    _write_preparer(faces: [{"source" => "NotoSerifTibetan-SemiBold.ttf", "family" => "NotoSerifTibetan", "weight" => 600, "codepoints" => [65, 0xf0b, 0xf40]}])
    @fonts.prepare
    fonts = _json("fallback-font-set.json").fetch("manifest").fetch("fonts")
    assert_equal([400, 600, 700], fonts.map { |font| font.fetch("weight") })
    assert_equal 1, fonts.map { |font| font.fetch("sha256") }.uniq.length
    assert_equal "https://raw.githubusercontent.com/notofonts/noto-fonts/ffebf8c1ee449e544955a7e813c54f9b73848eac/hinted/ttf/NotoSerifTibetan/NotoSerifTibetan-SemiBold.ttf", fonts.first.fetch("url")
    assert_equal [[0xf0b, 0xf0b], [0xf40, 0xf40]], fonts.first.fetch("ranges")
  end

  #: () -> void
  def test_script_families_have_stable_priority_and_require_a_usable_regular_role
    _write_preparer(faces: ["NotoSansThai", "NotoSansArabic", "NotoSansDevanagari", "NotoSans"].map do |family|
      {"source" => "NotoSans.ttc", "family" => family, "weight" => 400, "codepoints" => [65, 67]}
    end)
    @fonts.prepare
    assert_equal(["NotoSans", "NotoSansArabic", "NotoSansDevanagari", "NotoSansThai"], _json("fallback-font-set.json").fetch("manifest").fetch("fonts").first(4).map { |font| font.fetch("family") })
    _write_preparer(faces: [{"source" => "NotoSans.ttc", "family" => "NotoSans", "weight" => 700, "codepoints" => [65]}])
    assert_match(/usable 400 face/, assert_raises(RuntimeError) { @fonts.prepare }.message)
  end

  #: () -> void
  def test_packages_the_same_complete_set_for_renderer_and_native_tests
    @fonts.prepare
    destination = File.join(@root, "packaged")
    @fonts.package(destination: destination)
    fonts = _json("fallback-font-set.json").fetch("manifest").fetch("fonts")
    expected = [*fonts.map { |font| "#{font.fetch('sha256')}.font" }, "noto-fonts-OFL.txt", "noto-cjk-OFL.txt",
      "inter-regular.ttf", "inter-semibold.ttf", "inter-bold.ttf", "inter-OFL.txt", "fallback-font-set.json"].sort
    assert_equal expected, Dir.children(destination).sort
    assert_equal "Inter-600", File.binread(File.join(destination, "inter-semibold.ttf"))
  end

  #: () -> void
  def test_missing_generated_bodies_and_licenses_fail_packaging
    @fonts.prepare
    font = _json("fallback-font-set.json").fetch("manifest").fetch("fonts").first
    ["fonts/#{font.fetch('sha256')}.font", "fonts/noto-fonts-OFL.txt"].each do |name|
      path = _generated(name)
      bytes = File.binread(path)
      File.unlink(path)
      destination = File.join(@root, "packaged")
      assert_raises(Errno::ENOENT) { @fonts.package(destination: destination) }
      File.binwrite(path, bytes)
    end
  end

  private

  #: (String) -> String
  def _generated(path)
    File.join(@root, "generated/font-assets", path)
  end

  #: (String) -> Hash[String, Object]
  def _json(path)
    JSON.parse(File.binread(_generated(path)))
  end

  #: () -> Integer
  def _invocations
    path = File.join(@root, "build/fonts/calls")
    File.exist?(path) ? File.read(path).length : 0
  end

  #: (?faces: Array[Hash[String, String | Integer | Array[Integer]]]) -> void
  def _write_preparer(faces: [
    {"source" => "NotoSans.ttc", "family" => "NotoSans", "weight" => 400, "codepoints" => [65, 69]},
    {"source" => "NotoSans.ttc", "family" => "NotoSans", "weight" => 600, "codepoints" => [65, 67, 68]},
    {"source" => "NotoSans.ttc", "family" => "NotoSans", "weight" => 700, "codepoints" => [65, 70]}
  ])
    File.write(File.join(@root, "build/fonts/prepare-fonts.py"), <<~PYTHON)
      import json, pathlib, sys
      root = pathlib.Path(sys.argv[1])
      with pathlib.Path(__file__).with_name("calls").open("a") as calls:
          calls.write("x")
      roles = []
      for weight in [400, 600, 700]:
          path = "inter-%s.ttf" % weight
          (root / path).write_bytes(("Inter-%s" % weight).encode())
          roles.append({"path": path, "source": "Inter.ttf", "family": "Inter", "weight": weight, "codepoints": [65, 66, 8230]})
      fallbacks = json.loads(#{JSON.generate(JSON.generate(faces))})
      for index, face in enumerate(fallbacks):
          face["path"] = "fallback-%s.ttf" % index
          (root / face["path"]).write_bytes(("fallback-%s" % index).encode())
      (root / "prepared.json").write_text(json.dumps({"roles": roles, "fallbacks": fallbacks}))
    PYTHON
  end
end
