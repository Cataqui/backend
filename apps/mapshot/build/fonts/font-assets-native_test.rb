# frozen_string_literal: true

require_relative "../../test/test_helper"
require "digest"
require "fileutils"
require "json"
require "tmpdir"
require_relative "font-assets"

class MapshotFontAssetsNativeTest < Minitest::Test
  #: () -> void
  def test_fonttools_rejects_invalid_external_font_data_before_publication
    Dir.mktmpdir("mapshot-invalid-fonts-", "/tmp") do |root|
      directory = File.join(root, "build/fonts/assets/sources")
      FileUtils.mkdir_p(directory)
      FileUtils.cp(File.join(__dir__, "prepare-fonts.py"), File.join(root, "build/fonts/prepare-fonts.py"))
      ["Inter.ttf", "inter-OFL.txt", "noto-fonts-OFL.txt", "noto-cjk-OFL.txt"].each do |name|
        File.write(File.join(directory, name), "invalid font input")
      end
      fonts = MapshotFontAssets.new(application_root: root)
      error = assert_raises(RuntimeError) { fonts.prepare }
      assert_match(/Not a TrueType or OpenType font/, error.message)
      refute File.exist?(File.join(root, "generated/font-assets/fallback-font-set.json"))
    end
  end

  #: () -> void
  def test_fonttools_preserves_the_qualified_outline_bytes_and_complete_font_set
    Dir.mktmpdir("mapshot-qualified-fonts-", "/tmp") do |root|
      FileUtils.mkdir_p(File.join(root, "build/fonts/assets"))
      File.symlink(File.join(__dir__, "assets/sources"), File.join(root, "build/fonts/assets/sources"))
      FileUtils.cp(File.join(__dir__, "prepare-fonts.py"), File.join(root, "build/fonts/prepare-fonts.py"))
      fonts = MapshotFontAssets.new(application_root: root)
      fonts.prepare
      directory = File.join(root, "generated/font-assets")
      output, error, status = Open3.capture3("node", "--input-type=module", "-e", <<~JAVASCRIPT, File.expand_path("../../src/renderer", __dir__), directory)
        import { readFileSync } from "node:fs";
        const { FallbackFontManifestSchema } = await import(`${process.argv[1]}/fonts/schemas/fallback-font-manifest.schema.ts`);
        FallbackFontManifestSchema.parse(JSON.parse(readFileSync(`${process.argv[2]}/fallback-font-set.json`, "utf8")).manifest);
      JAVASCRIPT
      assert status.success?, "Generated fonts must match the production schemas: #{output}#{error}"
      font_set = JSON.parse(File.binread(File.join(directory, "fallback-font-set.json")))
      assert_equal([
        "b857e14d1b64d8f1256d22f2783d15873628860c078edb37a1157572ebe425bb",
        "480eed35c05197493ae66a4dea25894c66c8dc7020db3eb9d0cca18d4dcc892d",
        "c92b124ebfdbb22f84cc56c8dd164db5880b3eb0f7004b9e8e1de3bcd05b98f2"
      ], ["regular", "semibold", "bold"].map { |role| Digest::SHA256.file(File.join(directory, "inter-#{role}.ttf")).hexdigest })
      manifest = font_set.fetch("manifest")
      noto = manifest.fetch("fonts").select { |font| font.fetch("url").end_with?("/NotoSans.ttc") }
      assert_equal 261, noto.length
      assert_equal 165, noto.map { |font| font.fetch("sha256") }.uniq.length
      noto.each do |font|
        assert_equal "\x00\x01\x00\x00".b, File.binread(File.join(directory, "fonts/#{font.fetch('sha256')}.font"), 4)
      end
      families = noto.map { |font| font.fetch("family") }.uniq
      ["NotoSansArabic", "NotoSansDevanagari", "NotoSansAdlam", "NotoSansCanadianAboriginal", "NotoSansHanifiRohingya", "NotoSansTaiTham"].each do |family|
        assert_includes families, family
      end
      ["NotoSansSignWriting", "NotoSansCuneiform", "NotoSansEgyptianHieroglyphs", "NotoSansMath", "NotoSansHebrewNew", "NotoSansTifinaghAPT"].each do |family|
        refute_includes families, family
      end
      cjk = manifest.fetch("fonts").select { |font| font.fetch("url").end_with?("/NotoSansCJK.ttc") }
      assert_equal 15, cjk.length
      assert_equal (0..14).to_a, cjk.map { |font| font.fetch("faceIndex") }.sort
      assert_equal 1, cjk.map { |font| font.fetch("sha256") }.uniq.length
      assert_equal Digest::SHA256.file(File.join(__dir__, "assets/sources/NotoSansCJK.ttc")).hexdigest, cjk.first.fetch("sha256")
      tibetan = manifest.fetch("fonts").select { |font| font.fetch("family") == "NotoSerifTibetan" }
      assert_equal([400, 600, 700], tibetan.map { |font| font.fetch("weight") })
      assert_equal ["106f99b032ede3c7e2e1d1bd9f4e0b4e993645c4fe30f04fa2b5848d70c5ea7a"], tibetan.map { |font| font.fetch("sha256") }.uniq
      assert_equal [609_596], tibetan.map { |font| font.fetch("bytes") }.uniq
      "ལྷ་ཁངམཆོད་རྟེན།དཔེ་མཛོད་ཁང་།".codepoints.each do |codepoint|
        assert(tibetan.first.fetch("ranges").any? { |first, last| codepoint.between?(first, last) })
      end
      fonts.package(destination: File.join(root, "packaged"))
      assert_equal 174, Dir.children(File.join(root, "packaged")).length
    end
  end
end
