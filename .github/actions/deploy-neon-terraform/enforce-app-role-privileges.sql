BEGIN;

SELECT set_config('cataqui.app_role_name', :'app_role_name', false);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_roles
    WHERE rolname = current_setting('cataqui.app_role_name')
      AND pg_has_role(oid, 'neon_superuser', 'MEMBER')
  ) THEN
    RAISE EXCEPTION '% is still managed by the Neon API and must be removed by Terraform before SQL creates the least-privilege role', current_setting('cataqui.app_role_name');
  END IF;
END
$$;

SELECT format(
  'CREATE ROLE %I WITH LOGIN PASSWORD %L',
  current_setting('cataqui.app_role_name'),
  :'app_role_password'
)
WHERE NOT EXISTS (
  SELECT 1
  FROM pg_roles
  WHERE rolname = current_setting('cataqui.app_role_name')
) \gexec

SELECT format(
  'ALTER ROLE %I WITH LOGIN PASSWORD %L',
  current_setting('cataqui.app_role_name'),
  :'app_role_password'
) \gexec

SELECT format(
  'REVOKE ALL PRIVILEGES ON DATABASE %I FROM %I',
  current_database(),
  current_setting('cataqui.app_role_name')
) \gexec
SELECT format(
  'GRANT CONNECT ON DATABASE %I TO %I',
  current_database(),
  current_setting('cataqui.app_role_name')
) \gexec

SELECT format(
  'REVOKE ALL PRIVILEGES ON SCHEMA public FROM %I',
  current_setting('cataqui.app_role_name')
) \gexec
SELECT format(
  'GRANT USAGE ON SCHEMA public TO %I',
  current_setting('cataqui.app_role_name')
) \gexec

SELECT format(
  'REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM %I',
  current_setting('cataqui.app_role_name')
) \gexec
SELECT format(
  'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO %I',
  current_setting('cataqui.app_role_name')
) \gexec

SELECT format(
  'REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM %I',
  current_setting('cataqui.app_role_name')
) \gexec
SELECT format(
  'GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO %I',
  current_setting('cataqui.app_role_name')
) \gexec

SELECT format(
  'GRANT USAGE ON TYPE %I.%I TO %I',
  type_namespace.nspname,
  database_type.typname,
  current_setting('cataqui.app_role_name')
)
FROM pg_type AS database_type
INNER JOIN pg_namespace AS type_namespace
  ON type_namespace.oid = database_type.typnamespace
WHERE type_namespace.nspname = 'public'
  AND database_type.typrelid = 0
  AND database_type.typelem = 0 \gexec

SELECT format(
  'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO %I',
  current_setting('cataqui.app_role_name')
) \gexec
SELECT format(
  'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO %I',
  current_setting('cataqui.app_role_name')
) \gexec
SELECT format(
  'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE ON TYPES TO %I',
  current_setting('cataqui.app_role_name')
) \gexec

DO $$
BEGIN
  IF pg_has_role(current_setting('cataqui.app_role_name'), 'neon_superuser', 'MEMBER') THEN
    RAISE EXCEPTION '% must not inherit neon_superuser', current_setting('cataqui.app_role_name');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_roles
    WHERE rolname = current_setting('cataqui.app_role_name')
      AND (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls)
  ) THEN
    RAISE EXCEPTION '% has forbidden administrative role attributes', current_setting('cataqui.app_role_name');
  END IF;
END
$$;

COMMIT;
