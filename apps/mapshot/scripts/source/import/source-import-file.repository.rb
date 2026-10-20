# frozen_string_literal: true

require "tmpdir"

module Cataqui
  module Mapshot
    class SourceImportFileRepository
      def open(path:, &operation)
        File.open(path, "rb", &operation)
      end

      def read_part(file:, length:)
        file.read(length)
      end

      def read(path:, length:)
        File.binread(path, length)
      end

      def with_directory(prefix:, parent:, &operation)
        Dir.mktmpdir(prefix, parent, &operation)
      end
    end
  end
end
