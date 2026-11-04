-- PostgreSQL grants EXECUTE to PUBLIC for future routines by default.
-- Revoke that global default for the migration role; per-schema REVOKE cannot
-- override a globally granted default. Existing routines/other owners are unchanged.
alter default privileges for role postgres revoke execute on functions from public;
