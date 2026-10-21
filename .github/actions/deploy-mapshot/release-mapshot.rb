#!/usr/bin/env ruby
# frozen_string_literal: true

require "digest"
require "fileutils"
require "json"
require "net/http"
require "optparse"
require "securerandom"
require "tempfile"
require "timeout"
require "tmpdir"
require "uri"

class MapshotRelease
  def initialize(input:, operation_id:, deadline_at:)
    @_input = input
    @_operation_id = operation_id
    @_deadline_at = deadline_at
    @_root = File.expand_path("../../..", __dir__)
    @_application_root = File.join(@_root, "apps/mapshot")
    @_account_id = ENV.fetch("CLOUDFLARE_ACCOUNT_ID")
    @_token = ENV.fetch("CLOUDFLARE_API_TOKEN")
    raise "Invalid Cloudflare account." unless @_account_id.match?(/\A[a-f0-9]{32}\z/)
    %w[CLOUDFLARE_API_TOKEN MAPSHOT_R2_ACCESS_KEY_ID MAPSHOT_R2_SECRET_ACCESS_KEY].each do |name|
      raise "Missing Mapshot deployment credentials." if ENV.fetch(name).empty?
    end
  end

  def run
    case @_input.fetch("operation")
    when "probe"
      _probe
    when "recover"
      _recover
    when "deploy"
      _resume
      _deploy
    when "transfer", "verify", "prepare"
      _resume
      source = if @_input.fetch("environment") == "production"
        _prepare_promotion
      else
        _data(
          operation: "sources.prepare", codeRevision: @_input.fetch("revision"),
          operationId: @_operation_id, refresh: @_input.fetch("refresh"),
          phase: @_input.fetch("operation"), deadlineAt: @_deadline_at
        )
      end
      if source.nil?
        raise "Preparation checkpoint saved; rerun the workflow to continue." if @_input.fetch("operation") == "prepare"
        return "checkpoint"
      end
      return "ready"
    end
    "complete"
  end

  private

  def _data(operation:, **params)
    Dir.mktmpdir("mapshot-data-") do |directory|
      output = File.join(directory, "result.json")
      _command(
        command: "pnpm", args: ["--filter", "@cataqui/mapshot", "release:data", "--output", output],
        input: JSON.generate(params.merge(operation: operation, environment: @_input.fetch("environment"))),
        cwd: @_root, timeout: operation == "retention.clean" ? 20 * 60 : 320 * 60
      )
      JSON.parse(File.read(output, encoding: "UTF-8"))
    end
  end

  def _prepare_promotion
    _data(
      operation: "promotion.prepare", operationId: @_operation_id,
      codeRevision: @_input.fetch("revision"), promote: @_input.fetch("promote"), deadlineAt: @_deadline_at
    )
  end

  def _deploy
    promoted = @_input.fetch("environment") == "production" ? _prepare_promotion : nil
    pending = _data(operation: "state.read").fetch("value").fetch("pending")
    raise "No prepared deployment is reserved." if pending.nil?
    unless pending.fetch("codeRevision") == @_input.fetch("revision")
      raise "Resume the pinned preparation revision before deploying another checkout."
    end
    source = promoted || _data(
      operation: "sources.readPrepared", slot: pending.fetch("slot"), operationId: pending.fetch("operation")
    )
    raise "Dataset preparation has not finished. Rerun the preparation jobs." if source.nil?

    Dir.mktmpdir("mapshot-built-worker-") do |directory|
      output = File.join(directory, "built.json")
      _command(
        command: "pnpm", args: ["--filter", "@cataqui/mapshot", "release:build", "--output", output],
        input: JSON.generate(
          environment: @_input.fetch("environment"), accountId: @_account_id, source: source,
          operation: pending.fetch("operation"), workerPath: File.join(directory, "worker.tar.gz")
        ),
        cwd: @_root, timeout: 320 * 60
      )
      built = JSON.parse(File.read(output, encoding: "UTF-8"))
      digest = built.fetch("worker").fetch("sha256")
      worker_path = built.fetch("worker").fetch("path")
      key = "deployments/artifacts/#{digest}.tar.gz"
      _data(operation: "storage.putArtifact", key: key, path: worker_path)
      deployment = {
        "slot" => pending.fetch("slot"), "source" => source, "codeRevision" => @_input.fetch("revision"),
        "image" => built.fetch("image"), "artifact" => { "key" => key, "sha256" => digest },
        "fingerprint" => _data(operation: "reservations.fingerprint", source: source)
      }
      _activate(deployment: deployment)
    end
    _data(operation: "retention.clean")
  end

  def _activate(deployment:)
    state = _data(operation: "state.read")
    value = state.fetch("value")
    pending = value.fetch("pending")
    if pending.nil? || pending.fetch("slot") != deployment.fetch("slot") ||
       pending.fetch("codeRevision") != deployment.fetch("codeRevision")
      raise "Candidate does not match the reserved deployment."
    end
    _data(
      operation: "state.write", etag: state.fetch("etag"),
      value: value.merge("pending" => pending.merge("candidate" => deployment, "stage" => "deploying"))
    )
    begin
      _deploy_and_probe(deployment: deployment)
    rescue StandardError
      _recover
      raise "Mapshot deployment failed; the last successful deployment was restored."
    end
    # An ambiguous success write stays fenced until recovery, without reusing a slot.
    current = _data(operation: "state.read")
    active = current.fetch("value").fetch("active")
    _data(
      operation: "state.write", etag: current.fetch("etag"),
      value: {
        "version" => 1, "active" => deployment, "pending" => nil,
        "previous" => active&.fetch("fingerprint") == deployment.fetch("fingerprint") ?
          current.fetch("value").fetch("previous") : active
      }
    )
  end

  def _resume
    state = _data(operation: "state.read")
    pending = state.fetch("value").fetch("pending")
    return if pending.nil? || %w[clearing preparing].include?(pending.fetch("stage"))
    if !state.fetch("value").fetch("active").nil? || pending.fetch("candidate").nil?
      _recover
      return
    end
    # First deployment has no recovery target; retry its whole retained candidate.
    candidate = pending.fetch("candidate")
    _deploy_and_probe(deployment: candidate)
    _data(
      operation: "state.write", etag: state.fetch("etag"),
      value: { "version" => 1, "active" => candidate, "previous" => nil, "pending" => nil }
    )
  end

  def _recover
    state = _data(operation: "state.read")
    value = state.fetch("value")
    pending = value.fetch("pending")
    return if pending.nil? || %w[clearing preparing].include?(pending.fetch("stage"))
    active = value.fetch("active")
    if active.nil?
      raise "First deployment failed; no successful deployment exists to restore. Retry the deployment."
    end
    _data(
      operation: "state.write", etag: state.fetch("etag"),
      value: value.merge("pending" => pending.merge("stage" => "recovering"))
    )
    _deploy_and_probe(deployment: active)
    current = _data(operation: "state.read")
    _data(operation: "state.write", etag: current.fetch("etag"), value: current.fetch("value").merge("pending" => nil))
  end

  def _deploy_and_probe(deployment:)
    pmtiles = deployment.fetch("source").fetch("release").fetch("pmtiles")
    dataset = _data(operation: "storage.headObject", key: pmtiles.fetch("objectKey"))
    if dataset.fetch("kind") == "missing" || dataset.fetch("etag") != pmtiles.fetch("etag") ||
       dataset.fetch("bytes") != pmtiles.fetch("bytes")
      raise "Retained Mapshot dataset is unavailable."
    end
    artifact = deployment.fetch("artifact")
    stored = _data(operation: "storage.headObject", key: artifact.fetch("key"))
    if stored.fetch("kind") == "missing"
      raise "Retained Mapshot Worker artifact is unavailable."
    end
    Dir.mktmpdir("mapshot-restore-") do |directory|
      archive = File.join(directory, "artifact.tar.gz")
      _data(
        operation: "storage.readRange", key: artifact.fetch("key"), offset: 0,
        length: stored.fetch("bytes"), etag: stored.fetch("etag"), path: archive
      )
      unless Digest::SHA256.file(archive).hexdigest == artifact.fetch("sha256")
        raise "Mapshot Worker artifact integrity failed."
      end
      worker = File.join(directory, "worker")
      FileUtils.mkdir(worker)
      entries = _command(command: "tar", args: ["-tzf", archive], cwd: directory, timeout: 10 * 60)
      if entries.lines.any? { |entry| entry.start_with?("/") || entry.chomp.split("/").include?("..") }
        raise "Invalid Worker artifact paths."
      end
      _command(command: "tar", args: ["-xzf", archive, "-C", worker], cwd: directory, timeout: 10 * 60)
      _command(
        command: "node", args: [File.join(@_application_root, "worker/node_modules/cf/bin/cf"),
                                 "deploy", "--prebuilt", "--mode", @_input.fetch("environment"),
                                 "--provision=false", "--containers-rollout=immediate"],
        cwd: worker, timeout: 10 * 60
      )
      _wait_for_rollout(image: deployment.fetch("image"))
    end
    _probe
  end

  def _probe
    Dir.mktmpdir("mapshot-probe-") do |directory|
      configuration = File.join(directory, "wrangler.jsonc")
      File.write(configuration, JSON.generate(
        name: "mapshot-deployment-probe", account_id: @_account_id, compatibility_date: "2026-10-02",
        services: [{ binding: "MAPSHOT", service: "cataqui-mapshot-#{@_input.fetch('environment')}", remote: true }]
      ), mode: "wx", perm: 0o600)
      output = File.join(directory, "render.json")
      _command(
        command: "pnpm", args: ["--filter", "@cataqui/mapshot", "release:probe", configuration, output],
        cwd: @_root, timeout: 125
      )
      result = JSON.parse(File.read(output, encoding: "UTF-8"))
      unless result.fetch("width") == 960 && result.fetch("height") == 960 && result.fetch("bytes").positive?
        raise "Live Mapshot returned an invalid image."
      end
    end
  end

  # Wrangler's container JSON omits active rollout identity/target/status. Read the
  # supported Containers API so an unrelated healthy image cannot pass this gate.
  def _wait_for_rollout(image:)
    deadline = Process.clock_gettime(Process::CLOCK_MONOTONIC) + (20 * 60)
    name = "cataqui-mapshot-#{@_input.fetch('environment')}"
    applications = []
    cursor = nil
    seen = []
    loop do
      page = _cloudflare(path: "/containers/applications#{cursor.nil? ? '' : "?page_token=#{URI.encode_uri_component(cursor)}"}")
      values = page.fetch("result")
      raise "Invalid Cloudflare applications." unless values.is_a?(Array)
      applications.concat(values.select { |application| application.fetch("name") == name })
      cursor = page.fetch("result_info", {}).fetch("next_page_token", nil)
      break if cursor.nil?
      raise "Cloudflare application pagination repeated." if seen.include?(cursor)
      raise "Invalid Cloudflare pagination." unless cursor.is_a?(String)
      seen.push(cursor)
    end
    raise "Expected one Mapshot container application." unless applications.length == 1
    id = applications.first.fetch("id")
    raise "Invalid Cloudflare application." unless id.is_a?(String) && !id.empty?
    while Process.clock_gettime(Process::CLOCK_MONOTONIC) < deadline
      application = _cloudflare(path: "/containers/applications/#{URI.encode_uri_component(id)}").fetch("result")
      raise "Invalid Cloudflare scheduling policy." unless application.fetch("scheduling_policy") == "default"
      rollout_id = application.fetch("active_rollout_id", nil)
      if rollout_id.nil?
        unless application.fetch("configuration").fetch("image") == image
          raise "Cloudflare container target changed unexpectedly."
        end
        return
      end
      raise "Invalid Cloudflare rollout." unless rollout_id.is_a?(String)
      rollout = _cloudflare(
        path: "/containers/applications/#{URI.encode_uri_component(id)}/rollouts/#{URI.encode_uri_component(rollout_id)}"
      ).fetch("result")
      raise "Cloudflare rollout targets another image." unless rollout.fetch("target_configuration").fetch("image") == image
      case rollout.fetch("status")
      when "completed" then return
      when "reverted", "replaced" then raise "Cloudflare rollout did not complete."
      when "pending", "progressing" then sleep 5
      else raise "Invalid Cloudflare rollout status."
      end
    end
    raise "Cloudflare container rollout timed out."
  end

  def _cloudflare(path:)
    uri = URI("https://api.cloudflare.com/client/v4/accounts/#{@_account_id}#{path}")
    response = Timeout.timeout(15) do
      Net::HTTP.start(uri.host, uri.port, use_ssl: true, open_timeout: 15, read_timeout: 15) do |http|
        request = Net::HTTP::Get.new(uri)
        request["Authorization"] = "Bearer #{@_token}"
        http.request(request)
      end
    end
    unless response.is_a?(Net::HTTPSuccess)
      raise "Cloudflare deployment inspection failed (#{response.code})."
    end
    output = JSON.parse(response.body)
    raise "Cloudflare deployment inspection failed." unless output.fetch("success") == true
    output
  end

  def _command(command:, args:, cwd:, timeout:, input: "")
    Tempfile.create("mapshot-command-") do |log|
      Tempfile.create("mapshot-input-") do |stdin|
        stdin.write(input)
        stdin.rewind
        pid = Process.spawn(command, *args, chdir: cwd, pgroup: true, in: stdin, out: log, err: log)
        status = nil
        begin
          Timeout.timeout(timeout) do
            loop do
              finished = Process.waitpid2(pid, Process::WNOHANG)
              if finished
                status = finished.last
                break
              end
              raise "Mapshot command output is too large." if log.size > 64 * 1024 * 1024
              sleep 0.05
            end
          end
          raise "Mapshot command failed (#{command})." unless status.success?
          raise "Mapshot command output is too large." if log.size > 64 * 1024 * 1024
          log.rewind
          log.read
        ensure
          if status.nil?
            begin
              Process.kill("TERM", -pid)
              Timeout.timeout(5) { Process.wait(pid) }
            rescue Timeout::Error
              Process.kill("KILL", -pid)
              Process.wait(pid)
            rescue Errno::ESRCH, Errno::ECHILD
              # A child that already exited needs no further cleanup.
            end
          end
        end
      end
    end
  end
end

if $PROGRAM_NAME == __FILE__
  begin
    File.umask(0o077)
    input = { "refresh" => false, "promote" => false }
    OptionParser.new do |parser|
      parser.on("--operation OPERATION") { |value| input["operation"] = value }
      parser.on("--environment ENVIRONMENT") { |value| input["environment"] = value }
      parser.on("--revision REVISION") { |value| input["revision"] = value }
      parser.on("--refresh") { input["refresh"] = true }
      parser.on("--promote") { input["promote"] = true }
    end.parse!
    raise "Unexpected release arguments." unless ARGV.empty?
    unless %w[transfer verify prepare deploy probe recover].include?(input.fetch("operation")) &&
           %w[staging production].include?(input.fetch("environment")) && input.fetch("revision").match?(/\A[a-f0-9]{40}\z/)
      raise "Invalid Mapshot release inputs."
    end
    identity = "#{ENV.fetch('GITHUB_RUN_ID', SecureRandom.uuid)}:#{ENV.fetch('GITHUB_RUN_ATTEMPT', '1')}:#{input.fetch('revision')}:#{input.fetch('environment')}"
    result = Timeout.timeout(320 * 60) do
      MapshotRelease.new(
        input: input, operation_id: Digest::SHA256.hexdigest(identity),
        deadline_at: (Time.now.to_f * 1000).to_i + (310 * 60 * 1000)
      ).run
    end
    puts(result == "checkpoint" ? "Mapshot phase checkpoint saved." : "Mapshot dataset is ready.") unless result == "complete"
  rescue StandardError
    warn "Mapshot release failed. Rerun the pinned release to resume preparation or recover its retained deployment."
    exit 1
  end
end
