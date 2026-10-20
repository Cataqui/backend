# frozen_string_literal: true

require "fileutils"
require "net/http"
require "timeout"

# cf/workerd exercises emitted decorator metadata and Worker crypto APIs.
# All bindings are local; these routes do not access external providers.
base = URI("http://127.0.0.1:18974")
FileUtils.mkdir_p(".wrangler")
File.open(".wrangler/runtime-check.log", "w") do |log|
  pid = Process.spawn(
    {
      "WRANGLER_SEND_METRICS" => "false",
      "CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_DB" => "postgres://auth:local@127.0.0.1:5432/auth",
      "WHATSAPP_AUTH_WEBHOOK_VERIFY_TOKEN" => "local-verification"
    },
    "pnpm", "exec", "cf", "dev", "--mode", "development", "--port", base.port.to_s,
    out: log, err: log, pgroup: true
  )
  begin
    Timeout.timeout(45) do
      loop do
        begin
          break if Net::HTTP.get_response(base + "/v1/health/live").code == "204"
        rescue Errno::ECONNREFUSED, EOFError
          sleep 0.2
          next
        end
        sleep 0.2
      end
    end
    verification_uri = base + "/webhooks/whatsapp"
    verification_uri.query = URI.encode_www_form(
      "hub.mode" => "subscribe", "hub.verify_token" => "local-verification", "hub.challenge" => "verified"
    )
    responses = 8.times.map do
      Thread.new { Net::HTTP.get_response(verification_uri) }
    end.map(&:value)
    abort "Compiled Worker verification failed." unless responses.all? do |response|
      response.code == "200" && response.body == "verified"
    end
    request = Net::HTTP::Post.new("/v1/notp/intents")
    request["Content-Type"] = "application/json"
    request.body = "{"
    response = Net::HTTP.start(base.host, base.port) { |http| http.request(request) }
    abort "Invalid input did not retain its HTTP error contract." unless response.code == "400"
    puts "PASS: compiled Worker starts; 8 concurrent injected webhook verifications succeed; invalid JSON returns 400."
  ensure
    Process.kill("TERM", -pid)
    Process.wait(pid)
  end
end
