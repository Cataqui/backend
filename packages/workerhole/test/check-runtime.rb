# frozen_string_literal: true

require "json"
require "net/http"
require "tempfile"

root = File.expand_path("..", __dir__)
port = Integer(ENV.fetch("WORKERHOLE_TEST_PORT", "8816"))
origin = URI("http://127.0.0.1:#{port}")
abort "Fixture compilation failed." unless system("pnpm", "exec", "tsdown", "--config", "test/tsdown.config.ts", chdir: root)

Tempfile.create(["workerhole-", ".log"]) do |log|
  command = ["pnpm", "exec", "cf", "dev", "--mode", "development", "--port", port.to_s]
  pid = Process.spawn(*command, chdir: root, out: log.path, err: log.path, pgroup: true)
  begin
    [true, false].each do |node_first|
      deadline = Process.clock_gettime(Process::CLOCK_MONOTONIC) + 120
      loop do
        begin
          response = Net::HTTP.start(origin.host, origin.port, read_timeout: 90) { |http| http.get("/?nodeFirst=#{node_first}") }
          raise "Fixture rejected its request: #{response.code} #{response.body}" unless response.code == "200"

          output = JSON.parse(response.body)
          expected = { "first" => node_first ? "node-first" : "worker-first", "image" => 1_048_576, "correctBytes" => true, "reverse" => 131_072, "afterIdle" => 17, "reconnected" => true }
          raise "Incorrect Workerhole fixture result: #{output.inspect}" unless expected.all? { |key, value| output[key] == value } && output["cancelled"] >= 1

          puts "Passed real workerd/Node container portal: #{JSON.generate(output)}"
          probe = Net::HTTP.start(origin.host, origin.port, read_timeout: 10) do |http|
            request = Net::HTTP::Get.new("/internal/workerhole?nodeFirst=#{node_first}")
            request["Connection"] = "Upgrade"
            request["Upgrade"] = "websocket"
            request["Sec-WebSocket-Version"] = "13"
            request["Sec-WebSocket-Key"] = "dGhlIHNhbXBsZSBub25jZQ=="
            http.request(request)
          end
          raise "Public HTTP unexpectedly exposed Workerhole: #{probe.code}" unless probe.code == "200" && probe.body == output.fetch("first")

          puts "Passed public HTTP WebSocket isolation without a path guard or EXPOSE 61357 (#{node_first ? 'node-first' : 'worker-first'})."
          break
        rescue Errno::ECONNREFUSED, EOFError
          raise "Cloudflare did not become ready." if Process.clock_gettime(Process::CLOCK_MONOTONIC) >= deadline

          sleep 0.1
        end
      end
    end
  rescue StandardError
    warn File.read(log.path)
    raise
  ensure
    [true, false].each do |node_first|
      begin
        Net::HTTP.start(origin.host, origin.port, read_timeout: 10) { |http| http.get("/stop?nodeFirst=#{node_first}") }
      rescue IOError, SystemCallError, Timeout::Error
        # The development server may already have stopped after a fixture failure.
      end
    end
    begin
      Process.kill("TERM", -pid)
    rescue Errno::ESRCH
      # The development server may have exited independently.
    end
    Process.wait(pid)
  end
end
