#!/usr/bin/env ruby
# frozen_string_literal: true

# OpenTofu diagnostics may include credentials from provider messages. Its sensitive
# flags do not redact arbitrary environment secrets, so this adapter limits and redacts diagnostics.
log_path, operation = ARGV
abort "Usage: summarize-failure.rb <log-path> <plan|apply>" unless log_path && %w[plan apply].include?(operation)

sensitive_values = ENV.filter_map do |name, value|
  value if name.match?(/(?:ACCESS_TOKEN|API_KEY|AUTH_JWT|CREDENTIAL|DATABASE.*URL|HMAC_KEY|PASSWORD|PRIVATE_KEY|SECRET|TOKEN)/) && value.length >= 4
end.sort_by { |value| -value.length }

def _redact(value:, sensitive_values:)
  redacted = sensitive_values.reduce(value) { |result, secret| result.gsub(secret, "[REDACTED]") }
  redacted.gsub(%r{(https?://)[^\s/@:]+:[^\s/@]+@}i, '\1[REDACTED]@')
          .gsub(/\b(?:eyJ[A-Za-z0-9_-]+\.){2}[A-Za-z0-9_-]+\b/, "[REDACTED_JWT]")
          .gsub(/(access[_-]?token|api[_-]?key|authorization|credential|password|private[_-]?key|secret|token)(\s*[:=]\s*)([^\s,;}]+)/i, '\1\2[REDACTED]')
          .gsub(/\b[A-Za-z0-9_+\/=\-]{40,}\b/, "[REDACTED]")
end

lines = File.read(log_path, encoding: "UTF-8").gsub(/\e\[[0-?]*[ -\/]*[@-~]/, "")
            .split(/\r?\n/, -1).map { |line| line.sub(/^\s*[╷│╵]\s?/, "") }
diagnostics = []
index = 0
while index < lines.length
  unless lines[index].start_with?("Error:")
    index += 1
    next
  end
  block = [lines[index]]
  lines.drop(index + 1).each do |line|
    break if line.start_with?("Error:")
    block << line if line.match?(/^(?:\s{2})?(?:with |on )/)
  end
  diagnostic = _redact(value: block.join("\n").strip, sensitive_values: sensitive_values)
  diagnostics << diagnostic unless diagnostic.empty? || diagnostics.include?(diagnostic)
  index += block.length
end

warn "OpenTofu #{operation} failed."
if diagnostics.empty?
  warn "No safe diagnostic could be extracted; inspect the provider and backend prerequisites."
else
  warn "Sanitized diagnostics:"
  warn diagnostics.first(5).join("\n\n")
end
