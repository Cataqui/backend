# frozen_string_literal: true

require "timeout"

module Cataqui
  module Mapshot
    class SourceImportError < StandardError
      CODES = %w[ABORTED STORAGE CONFLICT SOURCE INTEGRITY INVALID_INPUT ATTEMPTS_EXHAUSTED PREPARATION].freeze

      def code
        @_code
      end

      def retryable
        @_retryable
      end

      def initialize(code:)
        raise ArgumentError, "Unsupported source import failure." unless CODES.include?(code)

        @_code = code
        @_retryable = %w[ABORTED STORAGE CONFLICT SOURCE PREPARATION].include?(code)
        super("The source import did not complete.")
      end
    end

    # Ruby's provider SDKs expose request timeouts but no shared AbortSignal.
    # This scoped cancellation bridge interrupts an active request and removes
    # callbacks before returning, so sibling multipart requests can stop together.
    class SourceImportSignal
      # Like Timeout's internal control exception, cancellation must unwind SDK
      # and business rescue blocks before this scope translates it to an error.
      class Cancelled < Exception; end # rubocop:disable Lint/InheritException
      private_constant :Cancelled

      def initialize(deadline_at: nil)
        @_deadline_at = deadline_at
        @_aborted = false
        @_callbacks = {}
        @_mutex = Mutex.new
      end

      def aborted?
        @_mutex.synchronize { @_aborted } || (!@_deadline_at.nil? && Time.now.to_f * 1000 >= @_deadline_at)
      end

      def check!
        raise SourceImportError.new(code: "ABORTED") if aborted?
      end

      def abort!
        callbacks = @_mutex.synchronize do
          return if @_aborted

          @_aborted = true
          @_callbacks.values.dup
        end
        callbacks.each(&:call)
        nil
      end

      def with_timeout(seconds:)
        check!
        raise ArgumentError, "Invalid source request timeout." unless seconds.positive?

        deadline_at = (Time.now.to_f * 1000) + (seconds * 1000)
        deadline_at = [deadline_at, @_deadline_at].min unless @_deadline_at.nil?
        bounded = SourceImportSignal.new(deadline_at: deadline_at)
        owner = Thread.current
        scope = Object.new
        previous_scope = owner.thread_variable_get(:mapshot_source_request_scope)
        Thread.handle_interrupt(Cancelled => :never) do
          owner.thread_variable_set(:mapshot_source_request_scope, scope)
          active = true
          guard = Mutex.new
          detach_parent = _subscribe { bounded.abort! }
          detach_owner = bounded._subscribe do
            guard.synchronize do
              if active && owner != Thread.current && owner.alive? &&
                 owner.thread_variable_get(:mapshot_source_request_scope).equal?(scope)
                owner.raise(Cancelled)
              end
            end
          end
          begin
            # The standard library's default timeout uses a scope-tagged control
            # exception, so coincident nested deadlines cannot escape later into
            # another operation after one timeout has already been handled.
            Timeout.timeout([0.001, (deadline_at - (Time.now.to_f * 1000)) / 1000].max) do
              Thread.handle_interrupt(Cancelled => :immediate) do
                bounded.check!
                result = yield bounded
                bounded.check!
                result
              end
            end
          ensure
            guard.synchronize { active = false }
            detach_parent.call
            detach_owner.call
            owner.thread_variable_set(:mapshot_source_request_scope, previous_scope)
          end
        end
      rescue Timeout::Error, Cancelled
        raise SourceImportError.new(code: "ABORTED")
      end

      def link(child:)
        _subscribe { child.abort! }
      end

      protected

      def _subscribe(&callback)
        token = Object.new
        aborted = @_mutex.synchronize do
          @_callbacks[token] = callback
          @_aborted
        end
        callback.call if aborted
        -> { @_mutex.synchronize { @_callbacks.delete(token) } }
      end
    end
  end
end
