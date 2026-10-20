# frozen_string_literal: true

require "fileutils"
require "open3"
require "timeout"
require "uri"
require "aws-sdk-s3"

# The SDK and Wrangler own authentication and object transfer. Their download
# interfaces do not enforce the selected bundle's declared object lengths while
# streaming; the caller owns staging and publication of the complete bundle.
class MapshotIndexDownload
  class Failure < StandardError; end

  #: (application_root: String) -> MapshotIndexDownload
  def self.from_environment(application_root:)
    access = ENV["MAPSHOT_R2_ACCESS_KEY_ID"]
    secret = ENV["MAPSHOT_R2_SECRET_ACCESS_KEY"]
    return new(application_root: application_root) if access.nil? && secret.nil?

    unless access && !access.empty? && secret && !secret.empty?
      raise ArgumentError, "Mapshot R2 credentials are incomplete."
    end

    endpoint = ENV["MAPSHOT_R2_ENDPOINT"]
    unless endpoint
      account = ENV["CLOUDFLARE_ACCOUNT_ID"]
      unless account&.match?(/\A[a-f0-9]{32}\z/)
        raise ArgumentError, "Mapshot R2 account is invalid."
      end

      endpoint = "https://#{account}.r2.cloudflarestorage.com"
    end
    begin
      uri = URI.parse(endpoint)
    rescue URI::InvalidURIError
      raise ArgumentError, "Mapshot R2 endpoint is invalid.", cause: nil
    end
    unless uri.is_a?(URI::HTTPS) && uri.host && !uri.host.empty? && !uri.userinfo
      raise ArgumentError, "Mapshot R2 endpoint must use HTTPS."
    end

    client = Aws::S3::Client.new(
      region: "auto", endpoint: endpoint, credentials: Aws::Credentials.new(access, secret),
      retry_mode: "standard", http_open_timeout: 15, http_read_timeout: 60
    )
    new(application_root: application_root, client: client)
  end

  #: (application_root: String, ?client: Aws::S3::Client?) -> void
  def initialize(application_root:, client: nil)
    @_application_root = application_root
    @_client = client
  end

  #: (bucket: String, key: String, destination: String, ?maximum_bytes: Integer) -> void
  def download(bucket:, key:, destination:, maximum_bytes: (2**53) - 1)
    FileUtils.mkdir_p(File.dirname(destination))
    File.open(destination, File::WRONLY | File::CREAT | File::EXCL | File::NOFOLLOW, 0o600) do |file|
      if @_client
        begin
          bytes = 0
          Timeout.timeout(180) do
            # The SDK detects incomplete response bodies. The selected manifest
            # owns the object budget and the installer verifies its digest.
            @_client.get_object(bucket: bucket, key: key) do |chunk|
              bytes += chunk.bytesize
              raise Failure, "Index download exceeds its limit." if bytes > maximum_bytes

              file.write(chunk)
            end
          end
        rescue Failure
          raise
        rescue StandardError
          # SDK streaming callbacks may wrap provider, checksum, and cancellation
          # errors in SDK-specific exceptions. Keep their details inside this boundary.
          raise Failure, "Mapshot R2 download failed. Provider output was suppressed to protect credentials.", cause: nil
        end
      else
        begin
          arguments = [File.join(@_application_root, "node_modules/wrangler/bin/wrangler.js"),
            "r2", "object", "get", "#{bucket}/#{key}", "--remote", "--pipe"]
          Open3.popen3("node", *arguments, chdir: @_application_root, pgroup: true) do |input, stdout, stderr, process|
            input.close
            completed = false
            begin
              deadline = Process.clock_gettime(Process::CLOCK_MONOTONIC) + (10 * 60)
              streams = [stdout, stderr]
              bytes = 0
              until streams.empty?
                remaining = deadline - Process.clock_gettime(Process::CLOCK_MONOTONIC)
                raise Failure, "Index download timed out." unless remaining.positive?

                readable = IO.select(streams, nil, nil, remaining)
                raise Failure, "Index download timed out." unless readable

                readable.first.each do |stream|
                  begin
                    chunk = stream.read_nonblock(64 * 1024)
                    next unless stream == stdout

                    bytes += chunk.bytesize
                    raise Failure, "Index download exceeds its limit." if bytes > maximum_bytes

                    file.write(chunk)
                  rescue IO::WaitReadable
                    next
                  rescue EOFError
                    streams.delete(stream)
                  end
                end
              end
              remaining = deadline - Process.clock_gettime(Process::CLOCK_MONOTONIC)
              unless remaining.positive? && process.join(remaining) && process.value.success?
                raise Failure, "Mapshot Wrangler download failed."
              end

              completed = true
            ensure
              unless completed
                begin
                  # Wrangler's launcher can exit while its child still owns the pipes.
                  Process.kill("KILL", -process.pid)
                rescue Errno::ESRCH
                  # The entire process group already exited.
                end
                process.join
              end
            end
          end
        rescue SystemCallError, IOError
          raise Failure, "Mapshot Wrangler download failed. Provider output was suppressed to protect credentials.", cause: nil
        end
      end
      file.chmod(0o644)
    end
    nil
  end

end
