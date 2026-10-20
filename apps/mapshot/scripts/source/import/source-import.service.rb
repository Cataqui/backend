# frozen_string_literal: true

require "tmpdir"
require_relative "source-import.error"
require_relative "source-import-file.service"

module Cataqui
  module Mapshot
    # Provider CLIs do not resume a verified planet transfer across CI jobs.
    # Ruby owns the conditional journal and multipart lifecycle; the Node domain
    # adapter only verifies map bytes and prepares the specialized map indexes.
    class SourceImportService
      PART_BYTES = 64 * 1024 * 1024

      def initialize(storage:, archives:, domain:, files: nil, file_repository: SourceImportFileRepository.new, clock: -> { (Time.now.to_f * 1000).to_i }, temp_directory: Dir.tmpdir)
        @_storage = storage
        @_archives = archives
        @_domain = domain
        @_file_repository = file_repository
        @_files = files || SourceImportFileService.new(storage: storage, repository: file_repository)
        @_clock = clock
        @_temp_directory = temp_directory
      end

      def run(input:, phase:, deadline_at:, signal: nil, timeout: 320 * 60)
        (signal || SourceImportSignal.new).with_timeout(seconds: timeout) do |outer|
          validated_input = @_domain.validate(kind: "import-job", value: input)
          outer.check!
          state = _read(id: validated_input.fetch("id"), signal: outer)
          outer.check!
          if state && state.fetch("checkpoint").fetch("input") != validated_input
            raise SourceImportError.new(code: "CONFLICT")
          end
          checkpoint = state&.fetch("checkpoint")
          return checkpoint.fetch("status") if checkpoint && checkpoint.fetch("status").fetch("kind") == "ready"
          if checkpoint && checkpoint.fetch("status").fetch("kind") == "failed" &&
             !checkpoint.fetch("status").fetch("retryable") && !_expired_create(checkpoint: checkpoint)
            return checkpoint.fetch("status")
          end
          if (validated_input.fetch("archive").fetch("bytes").to_f / PART_BYTES).ceil > 10_000
            return {"kind" => "failed", "id" => validated_input.fetch("id"), "code" => "CAPACITY", "retryable" => false}
          end
          if checkpoint && _expired_create(checkpoint: checkpoint)
            checkpoint.merge!("generation" => 0,
                              "objectKey" => validated_input["objectKey"] || "source/import/attempts/#{validated_input.fetch('id')}/0/archive.pmtiles",
                              "sourceEtag" => nil, "objectEtag" => nil, "verifiedArchive" => nil, "packedIndex" => nil, "parts" => [])
            _phase(state: state, stage: "planning", phase: "planning", signal: outer)
          end
          if state.nil?
            now = @_clock.call
            checkpoint = {
              "schemaVersion" => 1, "id" => validated_input.fetch("id"), "input" => validated_input,
              "generation" => 0, "stage" => "planning", "updatedAt" => now,
              "objectKey" => validated_input["objectKey"] || "source/import/attempts/#{validated_input.fetch('id')}/0/archive.pmtiles",
              "uploadId" => nil, "sourceEtag" => nil, "objectEtag" => nil, "verifiedArchive" => nil,
              "packedIndex" => nil, "parts" => [],
              "status" => {"kind" => "running", "id" => validated_input.fetch("id"), "phase" => "planning", "updatedAt" => now}
            }
            # Validate untrusted/new state once. Later writes mutate this owned
            # checkpoint through the closed transitions below; rereads validate
            # again at the storage boundary without spawning Node for every part.
            checkpoint = @_domain.validate(kind: "import-checkpoint", value: checkpoint)
            stored = @_storage.write_checkpoint(id: validated_input.fetch("id"), expected_etag: nil, value: checkpoint, signal: outer)
            if stored.fetch("kind") == "conflict"
              state = _read(id: validated_input.fetch("id"), signal: outer)
              if state.nil? || state.fetch("checkpoint").fetch("input") != validated_input
                raise SourceImportError.new(code: "CONFLICT")
              end
              return state.fetch("checkpoint").fetch("status")
            end
            state = {"checkpoint" => checkpoint, "etag" => stored.fetch("etag")}
          end
          outer.check!
          return state if state.key?("kind")

          # The final ten minutes remain available for durable failure receipts.
          begin
            outer.with_timeout(seconds: [0.001, (deadline_at - @_clock.call) / 1000.0].max) do |bounded|
              begin
  checkpoint = state.fetch("checkpoint")
  if %w[planning creating].include?(checkpoint.fetch("stage"))
    raise SourceImportError.new(code: "ATTEMPTS_EXHAUSTED") if checkpoint.fetch("generation") >= 3
    unless checkpoint.fetch("uploadId").nil?
      @_storage.abort_multipart(key: checkpoint.fetch("objectKey"), upload_id: checkpoint.fetch("uploadId"), signal: bounded)
    end
    generation = checkpoint.fetch("generation") + 1
    checkpoint.merge!("generation" => generation,
                      "objectKey" => checkpoint.fetch("input")["objectKey"] || "source/import/attempts/#{checkpoint.fetch('id')}/#{generation}/archive.pmtiles",
                      "uploadId" => nil, "sourceEtag" => nil, "objectEtag" => nil, "verifiedArchive" => nil, "packedIndex" => nil, "parts" => [])
    _phase(state: state, stage: "creating", phase: "transferring", signal: bounded)
    upload = @_storage.create_multipart(key: checkpoint.fetch("objectKey"), signal: bounded)
    checkpoint["uploadId"] = upload.fetch("uploadId")
    _phase(state: state, stage: "uploading", phase: "transferring", signal: bounded)
  end
  if checkpoint.fetch("stage") == "uploading"
    raise SourceImportError.new(code: "INTEGRITY") if checkpoint.fetch("uploadId").nil?
    _phase(state: state, stage: "uploading", phase: "transferring", signal: bounded)
    total = (checkpoint.fetch("input").fetch("archive").fetch("bytes").to_f / PART_BYTES).ceil
    raise SourceImportError.new(code: "INTEGRITY") if checkpoint.fetch("parts").any? { |part| part.fetch("partNumber") > total }
    acknowledged = checkpoint.fetch("parts").map { |part| part.fetch("partNumber") }
    remaining = (1..total).reject { |part| acknowledged.include?(part) }
    receipts = Mutex.new
    record = lambda do |part|
      receipts.synchronize do
        checkpoint.fetch("parts").push(part).sort_by! { |value| value.fetch("partNumber") }
        _save(state: state, signal: bounded)
      end
    end
    if checkpoint.fetch("sourceEtag").nil? && !remaining.empty?
      record.call(_transfer_part(checkpoint: checkpoint, part_number: remaining.shift, signal: bounded))
    end
    controller = SourceImportSignal.new(deadline_at: deadline_at)
    detach = bounded.link(child: controller)
    queue = Queue.new
    remaining.each { |part| queue.push(part) }
    workers = Array.new([2, remaining.length].min) do
      Thread.new do
        loop do
          break if @_clock.call >= deadline_at - 90_000
          part_number = begin
            queue.pop(true)
          rescue ThreadError
            nil
          end
          break if part_number.nil?
          record.call(_transfer_part(checkpoint: checkpoint, part_number: part_number, signal: controller))
        end
        nil
      rescue StandardError => error
        controller.abort!
        error
      end
    end
    begin
      results = workers.map(&:value)
      failure = results.find { |result| result.is_a?(Exception) }
      raise failure if failure
    ensure
      controller.abort!
      workers.each(&:join)
      detach.call
    end
    next unless checkpoint.fetch("parts").length == total
    _phase(state: state, stage: "completing", phase: "transferring", signal: bounded)
  end
  if checkpoint.fetch("stage") == "completing"
    existing = @_storage.head_object(key: checkpoint.fetch("objectKey"), signal: bounded)
    if existing.fetch("kind") == "object"
      raise SourceImportError.new(code: "INTEGRITY") unless existing.fetch("bytes") == checkpoint.fetch("input").fetch("archive").fetch("bytes")
      checkpoint["objectEtag"] = existing.fetch("etag")
    else
      raise SourceImportError.new(code: "STORAGE") if checkpoint.fetch("uploadId").nil?
      object = @_storage.complete_multipart(key: checkpoint.fetch("objectKey"), upload_id: checkpoint.fetch("uploadId"),
                                            parts: checkpoint.fetch("parts"), signal: bounded)
      raise SourceImportError.new(code: "INTEGRITY") unless object.fetch("bytes") == checkpoint.fetch("input").fetch("archive").fetch("bytes")
      checkpoint["objectEtag"] = object.fetch("etag")
    end
    _phase(state: state, stage: "verifying", phase: "verifying", signal: bounded)
  end
  next if phase == "transfer"
  raise SourceImportError.new(code: "INTEGRITY") unless %w[verifying references].include?(checkpoint.fetch("stage"))
  raise SourceImportError.new(code: "INTEGRITY") if checkpoint.fetch("objectEtag").nil?
  verified = checkpoint.fetch("verifiedArchive")
  key = verified&.fetch("objectKey") || checkpoint.fetch("objectKey")
  object = @_storage.head_object(key: key, signal: bounded)
  if object.fetch("kind") != "object" || object.fetch("etag") != checkpoint.fetch("objectEtag") ||
     object.fetch("bytes") != checkpoint.fetch("input").fetch("archive").fetch("bytes")
    raise SourceImportError.new(code: "INTEGRITY")
  end
  landmarks = checkpoint.fetch("packedIndex")
  reusable_verification = false
  if verified && landmarks
    index = @_storage.head_object(key: landmarks.fetch("key"), signal: bounded)
    if landmarks.fetch("archiveId") == verified.fetch("id") &&
       landmarks.fetch("key") == "source/import/attempts/#{checkpoint.fetch('id')}/#{checkpoint.fetch('generation')}/references/landmarks.pmtiles" &&
       index.fetch("kind") == "object" && index.fetch("bytes") == landmarks.fetch("bytes")
      reusable_verification = true
    end
  end
  unless reusable_verification
    raise SourceImportError.new(code: "PREPARATION") if phase == "prepare"
    checkpoint["packedIndex"] = nil
    _phase(state: state, stage: "verifying", phase: "verifying", signal: bounded)
    verified = @_file_repository.with_directory(prefix: "mapshot-source-verify-", parent: @_temp_directory) do |directory|
      computed = @_domain.verify_archive_and_extract_landmarks(checkpoint: state.fetch("checkpoint"), work_directory: directory,
                                         deadline_at: deadline_at, signal: bounded, heartbeat: -> { _save(state: state, signal: bounded) })
      receipt = computed.fetch("landmarks")
      landmarks = {"key" => "source/import/attempts/#{checkpoint.fetch('id')}/#{checkpoint.fetch('generation')}/references/landmarks.pmtiles",
                   "sha256" => receipt.fetch("sha256"), "bytes" => receipt.fetch("bytes"),
                   "archiveId" => receipt.fetch("archiveId")}
      @_files.upload(path: receipt.fetch("path"), index: landmarks, signal: bounded)
      checkpoint["verifiedArchive"] = computed.fetch("archive")
      checkpoint["packedIndex"] = landmarks
      _save(state: state, signal: bounded)
      computed.fetch("archive")
    end
  end
  _phase(state: state, stage: "references", phase: "references", signal: bounded)
  next if phase == "verify"
  landmarks = checkpoint.fetch("packedIndex")
  raise SourceImportError.new(code: "INTEGRITY") if landmarks.nil?
  release = @_domain.validate(kind: "source-release", value: {
                                      "schemaVersion" => 1,
                                      "pmtiles" => verified,
                                      "references" => {"id" => landmarks.fetch("sha256"), "catalogueKey" => landmarks.fetch("key")}
                                    })
  reference = @_file_repository.with_directory(prefix: "mapshot-source-indexes-", parent: @_temp_directory) do |directory|
    prepared = @_domain.prepare_indexes(release: release, landmarks: landmarks, work_directory: directory,
                                        deadline_at: deadline_at, signal: bounded)
    prepared.fetch("files").each do |file|
      bytes = @_file_repository.read(path: file.fetch("path"), length: file.fetch("bytes"))
      @_storage.put_raw(key: file.fetch("key"), bytes: bytes, content_type: file.fetch("contentType"), signal: bounded)
    end
    prepared.fetch("reference")
  end
  raise SourceImportError.new(code: "INTEGRITY") unless reference.fetch("archiveId") == release.fetch("pmtiles").fetch("id")
  checkpoint["stage"] = "ready"
  checkpoint["status"] = {"kind" => "ready", "id" => checkpoint.fetch("id"), "release" => release, "prepared" => reference}
  _save(state: state, signal: bounded)
rescue StandardError => error
  failure = error.is_a?(SourceImportError) ? error : SourceImportError.new(code: bounded.aborted? ? "ABORTED" : "PREPARATION")
  _fail(state: state, failure: failure)
end
            end
          rescue SourceImportError => error
            acknowledged_abort = state["failureAcknowledged"] &&
              state.fetch("checkpoint").fetch("status")["code"] == "ABORTED"
            unless error.code == "ABORTED" && acknowledged_abort
              raise unless error.code == "ABORTED" && !state["failureSaveAttempted"] &&
                (outer.aborted? || @_clock.call >= deadline_at)

              _fail(state: state, failure: error)
            end
          end
          return state.fetch("checkpoint").fetch("status")
        end
      end

      private

      def _expired_create(checkpoint:)
        status = checkpoint.fetch("status")
        status.fetch("kind") == "failed" && status.fetch("code") == "CAPACITY" && !status.fetch("retryable") &&
          checkpoint.fetch("stage") == "creating" && checkpoint.fetch("generation") == 3 &&
          checkpoint.fetch("uploadId").nil? && @_clock.call - checkpoint.fetch("updatedAt") >= 7 * 24 * 60 * 60 * 1000
      end

      def _read(id:, signal:)
        stored = @_storage.read_checkpoint(id: id, signal: signal)
        return nil if stored.fetch("kind") == "missing"

        {"checkpoint" => stored.fetch("value"), "etag" => stored.fetch("etag")}
      end

      def _save(state:, signal:)
        checkpoint = state.fetch("checkpoint")
        checkpoint["updatedAt"] = @_clock.call
        checkpoint.fetch("status")["updatedAt"] = checkpoint.fetch("updatedAt") if checkpoint.fetch("status").fetch("kind") == "running"
        stored = @_storage.write_checkpoint(id: checkpoint.fetch("id"), expected_etag: state.fetch("etag"), value: checkpoint, signal: signal)
        raise SourceImportError.new(code: "CONFLICT") if stored.fetch("kind") == "conflict"

        state["etag"] = stored.fetch("etag")
      end

      def _phase(state:, stage:, phase:, signal:)
        checkpoint = state.fetch("checkpoint")
        checkpoint["stage"] = stage
        checkpoint["status"] = {"kind" => "running", "id" => checkpoint.fetch("id"), "phase" => phase, "updatedAt" => @_clock.call}
        _save(state: state, signal: signal)
      end

      def _fail(state:, failure:)
        checkpoint = state.fetch("checkpoint")
        state["failureSaveAttempted"] = true
        checkpoint["status"] = {"kind" => "failed", "id" => checkpoint.fetch("id"),
                                "code" => {
                                  "ABORTED" => "ABORTED", "STORAGE" => "STORAGE_UNAVAILABLE", "CONFLICT" => "STORAGE_UNAVAILABLE",
                                  "SOURCE" => "SOURCE_UNAVAILABLE", "INTEGRITY" => "INTEGRITY_FAILED", "INVALID_INPUT" => "INVALID_CONFIG",
                                  "ATTEMPTS_EXHAUSTED" => "CAPACITY", "PREPARATION" => "GENERATION_FAILED"
                                }.fetch(failure.code), "retryable" => failure.retryable}
        checkpoint["stage"] = "references" if checkpoint.fetch("stage") == "ready"
        SourceImportSignal.new.with_timeout(seconds: 15) { |receipt| _save(state: state, signal: receipt) }
        state["failureAcknowledged"] = true
      end

      def _transfer_part(checkpoint:, part_number:, signal:)
        raise SourceImportError.new(code: "INTEGRITY") if checkpoint.fetch("uploadId").nil?

        offset = (part_number - 1) * PART_BYTES
        source = @_archives.read(archive: checkpoint.fetch("input").fetch("archive"), offset: offset,
                                 length: [PART_BYTES, checkpoint.fetch("input").fetch("archive").fetch("bytes") - offset].min,
                                 etag: checkpoint.fetch("sourceEtag"), signal: signal)
        checkpoint["sourceEtag"] = source.fetch("etag")
        upload = {key: checkpoint.fetch("objectKey"), upload_id: checkpoint.fetch("uploadId"),
                  part_number: part_number, bytes: source.fetch("bytes"), signal: signal}
        begin
          etag = @_storage.write_part(**upload)
        rescue SourceImportError => error
          raise unless error.retryable && !signal.aborted?

          etag = @_storage.write_part(**upload)
        end
        {"partNumber" => part_number, "etag" => etag}
      end

    end
  end
end
