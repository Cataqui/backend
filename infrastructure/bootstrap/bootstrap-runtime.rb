# frozen_string_literal: true

require "json"
require "io/console"
require "net/http"
require "open3"
require "tmpdir"
require "uri"
require_relative "reconciliation"

# Provider CLIs and OpenTofu own provisioning. This runtime only supplies the
# interactive progress, protected input, serialization, and redacted diagnostics
# needed to coordinate the privileged local bootstrap across those tools.
module Bootstrap
  REPO_ROOT = File.expand_path("../..", __dir__)
  PLATFORMS_PATH = File.join(REPO_ROOT, "infrastructure/platforms.json")
  MANIFEST_PATH = File.join(REPO_ROOT, "infrastructure/manifest.json")
  KNOWN_SECRETS = Set.new

  module_function

  def _interactive?
    $stdin.tty? && $stdout.tty?
  end

  def log(message)
    if @active_phase
      @active_phase[:message] = message
      @active_phase[:control].update(title: message)
    else
      $stdout.puts(message)
    end
  end

  def start_bootstrap_ui
    return unless _interactive?

    $stdout.puts("Cataquí infrastructure bootstrap", "")
    $stdout.puts("Reconciles staging and production immediately.",
                 "Healthy resources and credentials are reused.",
                 "A protected secret field appears only when a required external credential is missing.", "")
  end

  def finish_bootstrap_ui
    $stdout.puts("Infrastructure bootstrap is healthy.")
  end

  def fail_bootstrap_ui(message)
    $stderr.puts(message)
  end

  def run_bootstrap_phase(pending:, complete:)
    unless _interactive?
      $stdout.puts("#{pending}...")
      result = yield
      $stdout.puts("#{complete}.")
      return result
    end

    require "tty-spinner"
    control = TTY::Spinner.new("[:spinner] :title", output: $stdout)
    @active_phase = {control: control, message: pending}
    control.update(title: pending)
    control.auto_spin
    begin
      result = yield
      control.update(title: complete)
      control.success
      result
    rescue StandardError, Interrupt
      control.update(title: "#{pending} failed")
      control.error
      raise
    ensure
      @active_phase = nil
    end
  end

  # Open3 drains both streams concurrently and waits without holding Ruby's
  # scheduler, so TTY::Spinner's animation thread stays live during CLI work.
  # Arguments are passed directly to the executable, never through a shell.
  def run_async(command, args, cwd: REPO_ROOT, env: ENV.to_h, inherit: false, allow_failure: false, input: nil)
    if inherit
      pid = Process.spawn(env, command, *args, chdir: cwd, unsetenv_others: true)
      status = Process.wait2(pid).last
      result = {"status" => status.exitstatus, "stdout" => "", "stderr" => ""}
    else
      stdout, stderr, status = Open3.capture3(env, command, *args, chdir: cwd, unsetenv_others: true,
                                            stdin_data: input || "")
      result = {"status" => status.exitstatus,
                "stdout" => stdout.force_encoding(Encoding::UTF_8).scrub,
                "stderr" => stderr.force_encoding(Encoding::UTF_8).scrub}
    end
    if result["status"] != 0 && !allow_failure
      detail = result["stderr"].empty? ? result["stdout"] : result["stderr"]
      detail = "command failed" if detail.empty?
      raise "#{command} failed: #{redact_secrets(value: detail, secrets: KNOWN_SECRETS).strip}"
    end
    result
  rescue SystemCallError => error
    raise "Unable to execute #{command}: #{redact_secrets(value: error.message, secrets: KNOWN_SECRETS)}"
  end

  def require_tool_async(command, version_args = ["--version"])
    run_async(command, version_args)
  end

  def prompt_hidden(title:, message:, guidance:, unavailable_message:)
    raise unavailable_message unless _interactive?

    require "tty-prompt"
    suspended_phase = @active_phase
    suspended_phase&.fetch(:control)&.pause
    @active_phase = nil
    begin
      $stdout.puts("", title, guidance)
      # Disable echo before TTY::Prompt displays the question: its reader only
      # enters raw mode after rendering, when a fast paste could otherwise echo.
      value = $stdin.noecho do
        TTY::Prompt.new(interrupt: ->(*) { raise Interrupt }).mask(message, mask: "•") do |question|
          question.required(true, "A value is required.")
          question.validate(/\S/, "A value is required.")
          question.modify(:strip)
        end
      end
      raise "Infrastructure bootstrap was cancelled." unless value.is_a?(String) && !value.empty?

      KNOWN_SECRETS.add(value)
      value
    rescue Interrupt
      raise "Infrastructure bootstrap was cancelled."
    ensure
      if suspended_phase
        @active_phase = suspended_phase
        suspended_phase.fetch(:control).resume
      end
    end
  end

  def acquire_lock
    path = File.join(Dir.tmpdir, "cataqui-infrastructure-bootstrap.lock")
    lock = File.open(path, File::RDWR | File::CREAT | File::NOFOLLOW, 0o600)
    metadata = lock.stat
    unless metadata.file? && metadata.uid == Process.euid && metadata.nlink == 1
      lock.close
      raise "Infrastructure bootstrap lock must be a regular file owned by the current user, with one link."
    end
    unless lock.flock(File::LOCK_EX | File::LOCK_NB)
      owner = lock.read.strip
      lock.close
      raise "Infrastructure bootstrap is already running as process #{owner}."
    end
    lock.rewind
    lock.truncate(0)
    lock.write(Process.pid.to_s)
    lock.flush
    # Keep the inode in place: unlinking a lock file permits two processes to
    # lock different inodes. The OS releases the lock even after interruption.
    -> { lock.close unless lock.closed? }
  end

  def http_request(url, method: "GET", headers: {}, body: nil)
    uri = URI(url)
    raise "Bootstrap provider requests require HTTPS." unless uri.is_a?(URI::HTTPS)

    request = Net::HTTPGenericRequest.new(method, !body.nil?, method != "HEAD", uri.request_uri, headers)
    request.body = body unless body.nil?
    Net::HTTP.start(uri.hostname, uri.port, use_ssl: true) { |http| http.request(request) }
  end

  def request_json(url, method: "GET", headers: {}, body: nil, accepted_statuses: [200])
    request_headers = {"accept" => "application/json"}.merge(headers)
    request_headers["content-type"] = "application/json" unless body.nil?
    response = http_request(url, method: method, headers: request_headers,
                           body: body.nil? ? nil : JSON.generate(body))
    unless accepted_statuses.include?(response.code.to_i)
      text = redact_secrets(value: response.body.to_s, secrets: KNOWN_SECRETS)
      raise "#{method} #{URI(url).path} failed with #{response.code}: #{text[0, 500]}"
    end
    return nil if response.code.to_i == 204

    JSON.parse(response.body)
  end
end
