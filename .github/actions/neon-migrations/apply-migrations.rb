#!/usr/bin/env ruby
# frozen_string_literal: true

require 'English'

# Neon actions own branch lifecycle; this adapter applies the repository's Prisma migrations.
application = ENV.fetch("INPUT_APPLICATION")
abort("Unsupported database owner.") unless %w[api auth].include?(application)
workspace = application == "api" ? "@cataqui/api" : "@cataqui/auth-worker"
url = ENV.fetch('DATABASE_OWNER_DIRECT_URL')
abort('Migrations require a direct database URL.') if url.empty? || url.include?('-pooler.')

unless system('pnpm', '--filter', workspace, 'prisma:migrate:deploy', out: File::NULL)
  exit($CHILD_STATUS&.exitstatus || 1)
end
unless system('pnpm', '--filter', workspace, 'exec', 'prisma', 'migrate', 'status', out: File::NULL)
  exit($CHILD_STATUS&.exitstatus || 1)
end
