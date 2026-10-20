# frozen_string_literal: true

require "digest"
require "fileutils"
require "json"
require "open3"
require "tmpdir"

# FontTools supplies the qualified font transformations. Ruby owns the app-specific
# coverage and packaging, which FontTools does not provide. Docker owns
# preparation reuse through its content-addressed build layers.
class MapshotFontAssets
  #: (?application_root: String) -> void
  def initialize(application_root: File.expand_path("../..", __dir__))
    @_application_root = File.expand_path(application_root)
  end

  #: () -> void
  def prepare
    directory = File.join(@_application_root, "generated/font-assets")
    input_directory = File.join(@_application_root, "build/fonts/assets/sources")
    inputs = Dir.children(input_directory).sort.filter_map do |name|
      path = File.join(input_directory, name)
      next unless File.file?(path) && !File.symlink?(path) && name.match?(/\.(?:ttf|otf|ttc|txt)\z/)
      bytes = File.binread(path)
      raise "A font license is empty: #{name}" if name.end_with?(".txt") && bytes.empty?
      {"name" => name, "bytes" => bytes}
    end
    raise "Supply the Inter.ttf variable font input." unless inputs.any? { |input| input.fetch("name") == "Inter.ttf" }

    font_inputs = inputs.select { |input| input.fetch("name").match?(/\.(?:ttf|otf|ttc)\z/) }
    prepared = Dir.mktmpdir("mapshot-fonts-") do |directory|
      font_inputs.each do |input|
        File.binwrite(File.join(directory, input.fetch("name")), input.fetch("bytes"))
      end
      _output, error, status = Open3.capture3("python3", File.join(@_application_root, "build/fonts/prepare-fonts.py"), directory)
      raise "FontTools preparation failed: #{error.strip}" unless status.success?
      metadata = JSON.parse(File.binread(File.join(directory, "prepared.json")))
      bodies = font_inputs.to_h { |input| [input.fetch("name"), input.fetch("bytes")] }
      [*metadata.fetch("roles"), *metadata.fetch("fallbacks")].each do |face|
        path = face.fetch("path")
        bodies[path] ||= File.binread(File.join(directory, path))
      end
      {
        "roles" => metadata.fetch("roles").map do |role|
          {"weight" => role.fetch("weight"), "codepoints" => role.fetch("codepoints"),
           "bytes" => bodies.fetch(role.fetch("path"))}
        end,
        "fallbacks" => metadata.fetch("fallbacks").map do |face|
          result = {"source" => face.fetch("source"), "family" => face.fetch("family"), "weight" => face.fetch("weight")}
          result["faceIndex"] = face.fetch("faceIndex") if face.key?("faceIndex")
          result.merge({"codepoints" => face.fetch("codepoints"),
                        "bytes" => bodies.fetch(face.fetch("path"))})
        end
      }
    end
    outputs = {}
    primary = prepared.fetch("roles").find { |role| role.fetch("weight") == 600 }.fetch("codepoints").to_h { |codepoint| [codepoint, true] }
    faces = prepared.fetch("fallbacks").map do |face|
      sha256 = _sha(face.fetch("bytes"))
      outputs["fonts/#{sha256}.font"] = face.fetch("bytes")
      result = {
        "url" => if face.fetch("source") == "NotoSerifTibetan-SemiBold.ttf"
                   "https://raw.githubusercontent.com/notofonts/noto-fonts/ffebf8c1ee449e544955a7e813c54f9b73848eac/hinted/ttf/NotoSerifTibetan/NotoSerifTibetan-SemiBold.ttf"
                 else
                   "https://raw.githubusercontent.com/Cataqui/backend/main/apps/mapshot/build/fonts/assets/sources/#{face.fetch('source')}"
                 end,
        "sha256" => sha256, "bytes" => face.fetch("bytes").bytesize, "family" => face.fetch("family"), "weight" => face.fetch("weight")
      }
      result["faceIndex"] = face.fetch("faceIndex") if face.key?("faceIndex")
      result["ranges"] = _ranges(face.fetch("codepoints").reject { |codepoint| primary.key?(codepoint) })
      result
    end
    families = faces.map { |face| face.fetch("family") }.uniq.sort_by { |family| [if family == "NotoSans"
                                                                                    0
                                                                                  elsif family.start_with?("NotoSansCJK")
                                                                                    1 + (["sc", "hk", "jp", "kr", "tc"].index(family[-2..]) || -1)
                                                                                  else
                                                                                    100
                                                                                  end, family] }
    fonts = [400, 600, 700].flat_map do |weight|
      families.map do |family|
        available = faces.select { |face| face.fetch("family") == family }
        selected = available.find { |face| face.fetch("weight") == weight } || available.find { |face| face.fetch("weight") == 400 }
        selected ||= available.find { |face| face.fetch("weight") == 600 } if family == "NotoSerifTibetan"
        raise "A supplied font lacks a usable #{weight} face." unless selected
        selected.merge({"weight" => weight})
      end
    end
    licenses = ["noto-fonts-OFL.txt", "noto-cjk-OFL.txt"].map do |name|
      input = inputs.find { |item| item.fetch("name") == name }
      raise "A required font license is missing." unless input
      outputs["fonts/#{name}"] = input.fetch("bytes")
      {"url" => "https://raw.githubusercontent.com/Cataqui/backend/main/apps/mapshot/build/fonts/assets/sources/#{name}",
       "sha256" => _sha(input.fetch("bytes")), "bytes" => input.fetch("bytes").bytesize}
    end
    manifest = {"schemaVersion" => 1, "fonts" => fonts,
                "primaryCoverage" => _ranges(primary.keys), "licenses" => licenses}
    outputs["fallback-font-set.json"] = JSON.generate({"manifest" => manifest})
    license = inputs.find { |input| input.fetch("name") == "inter-OFL.txt" }
    raise "The Inter license is missing." unless license
    outputs["inter-OFL.txt"] = license.fetch("bytes")
    prepared.fetch("roles").each do |role|
      outputs["inter-#{ {400 => 'regular', 600 => 'semibold', 700 => 'bold'}.fetch(role.fetch('weight')) }.ttf"] = role.fetch("bytes")
    end
    outputs.each do |path, bytes|
      destination = File.join(directory, path)
      FileUtils.mkdir_p(File.dirname(destination))
      File.binwrite(destination, bytes)
    end
  end

  #: (destination: String) -> void
  def package(destination:)
    directory = File.join(@_application_root, "generated/font-assets")
    manifest = JSON.parse(File.binread(File.join(directory, "fallback-font-set.json"))).fetch("manifest")
    fonts = manifest.fetch("fonts").map { |font| "#{font.fetch('sha256')}.font" }
    FileUtils.mkdir_p(destination)
    [*fonts.uniq, "noto-fonts-OFL.txt", "noto-cjk-OFL.txt"].each do |name|
      FileUtils.cp(File.join(directory, "fonts", name), File.join(destination, name))
    end
    ["inter-regular.ttf", "inter-semibold.ttf", "inter-bold.ttf", "inter-OFL.txt", "fallback-font-set.json"].each do |name|
      FileUtils.cp(File.join(directory, name), File.join(destination, name))
    end
  end

  private

  #: (Array[Integer]) -> Array[[Integer, Integer]]
  def _ranges(codepoints)
    codepoints.uniq.sort.each_with_object([]) do |codepoint, ranges|
      continues_range = ranges.last && codepoint == ranges.last[1] + 1
      if continues_range
        ranges.last[1] = codepoint
      else
        ranges << [codepoint, codepoint]
      end
    end
  end

  #: (String) -> String
  def _sha(bytes)
    Digest::SHA256.hexdigest(bytes)
  end

end
