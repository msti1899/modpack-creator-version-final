begin;
select plan(6);

select has_schema('public', 'The application schema is available');
select has_table('auth', 'users', 'Local Supabase Auth is installed');

-- Transaction-only probes verify effective grants, not an assumed CLI default.
create table public.__foundation_privilege_probe (id integer primary key);
select ok(not has_table_privilege('anon', 'public.__foundation_privilege_probe', 'SELECT'),
  'New application tables require explicit anonymous grants');
select ok(not has_table_privilege('authenticated', 'public.__foundation_privilege_probe', 'SELECT'),
  'New application tables require explicit authenticated grants');

create function public.__foundation_privilege_probe() returns integer
  language sql as 'select 1';
select ok(not has_function_privilege('anon', 'public.__foundation_privilege_probe()', 'EXECUTE'),
  'New application functions require explicit grants');
select ok(not has_function_privilege('authenticated', 'public.__foundation_privilege_probe()', 'EXECUTE'),
  'Authenticated users also require explicit function grants');

select * from finish();
rollback;
