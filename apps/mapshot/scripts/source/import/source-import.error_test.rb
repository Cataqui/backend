# frozen_string_literal: true

require_relative "../../../test/test_helper"
require_relative "source-import.error"

class SourceImportErrorTest < Minitest::Test
  def test_failure_codes_preserve_retryability_without_provider_details
    Cataqui::Mapshot::SourceImportError::CODES.each do |code|
      error = Cataqui::Mapshot::SourceImportError.new(code: code)
      assert_equal code, error.code
      assert_equal %w[ABORTED STORAGE CONFLICT SOURCE PREPARATION].include?(code), error.retryable
      assert_equal "The source import did not complete.", error.message
    end
    assert_raises(ArgumentError) { Cataqui::Mapshot::SourceImportError.new(code: "other") }
  end

  def test_explicit_abort_and_elapsed_deadline_fail_closed
    signal = Cataqui::Mapshot::SourceImportSignal.new
    refute signal.aborted?
    assert_nil signal.check!
    signal.abort!
    signal.abort!
    assert signal.aborted?
    assert_raises(Cataqui::Mapshot::SourceImportError) { signal.check! }
    expired = Cataqui::Mapshot::SourceImportSignal.new(deadline_at: 0)
    assert expired.aborted?
  end

  def test_timeout_and_parent_deadline_bound_active_requests
    signal = Cataqui::Mapshot::SourceImportSignal.new
    assert_equal "result", signal.with_timeout(seconds: 1) { "result" }
    assert_raises(ArgumentError) { signal.with_timeout(seconds: 0) { flunk } }
    error = assert_raises(Cataqui::Mapshot::SourceImportError) do
      signal.with_timeout(seconds: 0.01) { sleep 1 }
    end
    assert_equal "ABORTED", error.code
    bounded = Cataqui::Mapshot::SourceImportSignal.new(deadline_at: (Time.now.to_f * 1000) + 10)
    assert_raises(Cataqui::Mapshot::SourceImportError) { bounded.with_timeout(seconds: 1) { sleep 1 } }
  end

  def test_parent_abort_interrupts_an_active_sibling_request_and_detaches_after_return
    signal = Cataqui::Mapshot::SourceImportSignal.new
    ready = Queue.new
    worker = Thread.new do
      signal.with_timeout(seconds: 5) do
        ready.push(true)
        sleep 5
      end
    rescue Cataqui::Mapshot::SourceImportError => error
      error.code
    end
    ready.pop
    signal.abort!
    assert_equal "ABORTED", worker.value
    signal.with_timeout(seconds: 1) { flunk }
  rescue Cataqui::Mapshot::SourceImportError
    fresh = Cataqui::Mapshot::SourceImportSignal.new
    assert_equal true, fresh.with_timeout(seconds: 1) { true }
    assert_nil fresh.abort!
  ensure
    worker&.kill
    worker&.join
  end
end
