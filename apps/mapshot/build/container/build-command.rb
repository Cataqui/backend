# frozen_string_literal: true

require "open3"
require "io/wait"

# Docker, Wrangler, and Rspack own their commands. This boundary owns subprocess
# deadlines and cleanup while keeping credential-bearing diagnostics private.
class MapshotBuildCommand
  class Failure < StandardError; end

  #: (command: String, args: Array[String], cwd: String, ?capture_output: bool, ?env: Hash[String, String]) -> String?
  def run(command:, args:, cwd:, capture_output: false, env: {})
    output = +"".b
    Open3.popen2(env, command, *args, chdir: cwd, pgroup: true, err: File::NULL) do |input, stdout, process|
      input.close
      completed = false
      begin
        deadline = Process.clock_gettime(Process::CLOCK_MONOTONIC) + (command == "docker" ? 90 * 60 : 10 * 60)
        loop do
          remaining = deadline - Process.clock_gettime(Process::CLOCK_MONOTONIC)
          raise Failure, "Mapshot #{File.basename(command)} command timed out." unless remaining.positive?

          unless stdout.wait_readable(remaining)
            raise Failure, "Mapshot #{File.basename(command)} command timed out."
          end

          begin
            chunk = stdout.read_nonblock(64 * 1024)
            output << chunk if capture_output
          rescue IO::WaitReadable
            next
          rescue EOFError
            break
          end
        end
        remaining = deadline - Process.clock_gettime(Process::CLOCK_MONOTONIC)
        completed_before_deadline = remaining.positive? && process.join(remaining)
        unless completed_before_deadline
          raise Failure, "Mapshot #{File.basename(command)} command timed out."
        end
        unless process.value.success?
          raise Failure, "Mapshot #{File.basename(command)} command failed. Provider output was suppressed to protect credentials."
        end

        completed = true
      ensure
        unless completed
          begin
            Process.kill("KILL", -process.pid)
          rescue Errno::ESRCH
            # The command may have exited before its output was consumed.
          end
          process.join
        end
      end
    end
    capture_output ? output : nil
  rescue SystemCallError, IOError
    raise Failure, "Mapshot #{File.basename(command)} command could not complete. Provider output was suppressed to protect credentials.", cause: nil
  end
end
