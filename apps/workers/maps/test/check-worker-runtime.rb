require "fileutils"
require "net/http"
require "timeout"
require "uri"

base = URI("http://127.0.0.1:18975")
FileUtils.mkdir_p(".wrangler")
File.open(".wrangler/runtime-check.log", "w") do |log|
  pid = Process.spawn(
    {
      "CF_SEND_TELEMETRY" => "false",
      "WRANGLER_SEND_METRICS" => "false",
      "STATIC_MAP_LOCATION_SIGNING_KEY_BASE64URL" => "A" * 43
    },
    "pnpm", "exec", "cf", "dev", "--mode", "development", "--host", base.host, "--port", base.port.to_s,
    out: log, err: log, pgroup: true
  )
  begin
    Timeout.timeout(45) do
      loop do
        begin
          break if Net::HTTP.get_response(base + "/v1/health").code == "204"
        rescue Errno::ECONNREFUSED, EOFError
          sleep 0.2
          next
        end
        sleep 0.2
      end
    end
    abort "Compiled Worker OpenAPI response failed." unless Net::HTTP.get_response(base + "/openapi.json").code == "200"
    responses = 8.times.map do
      Thread.new { Net::HTTP.get_response(base + "/static/v1/reference.webp?size=480x480") }
    end.map(&:value)
    abort "Compiled static dependency graph failed." unless responses.all? do |response|
      response.code == "404" && response.body.include?("IMAGE_NOT_FOUND")
    end
    request = Net::HTTPGenericRequest.new("QUERY", true, true, "/places/search")
    request["Authorization"] = "Bearer #{'a' * 43}"
    request["Content-Type"] = "application/json"
    request["Accept-Language"] = "pt-BR"
    request.body = '{"query":"Place","sessionToken":"session"}'
    response = Net::HTTP.start(base.host, base.port) { |http| http.request(request) }
    abort "Compiled Auth dependency graph failed." unless response.code == "503" && response.body.include?("AUTH_UNAVAILABLE")
    puts "PASS: compiled Worker starts; OpenAPI succeeds; 8 concurrent static requests resolve their graph; unavailable Auth retains its 503 contract."
  ensure
    Process.kill("TERM", -pid)
    Process.wait(pid)
  end
end
