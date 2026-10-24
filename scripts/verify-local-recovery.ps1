$ErrorActionPreference = 'Stop'
$psql = 'C:\Program Files\PostgreSQL\17\bin\psql.exe'
$database = 'skoon_recovery_20261024_20261024_public'
$log = 'D:\Sokoon\docs\BACKUP_RECOVERY_PUBLIC_VERIFY.log'

function Invoke-Verification([string]$sql) {
  & $psql -X -W -h 127.0.0.1 -p 4444 -U postgres -d $database -v ON_ERROR_STOP=1 -Atc $sql
  if ($LASTEXITCODE -ne 0) { throw "psql verification failed with exit code $LASTEXITCODE" }
}

"Recovery database: $database" | Tee-Object -FilePath $log
"Verified UTC: $([DateTime]::UtcNow.ToString('o'))" | Tee-Object -FilePath $log -Append
"Exact critical table row counts:" | Tee-Object -FilePath $log -Append
Invoke-Verification "select 'orders', count(*) from public.orders union all select 'payments', count(*) from public.payments union all select 'shifts', count(*) from public.shifts union all select 'inventory_items', count(*) from public.inventory_items union all select 'inventory_batches', count(*) from public.inventory_batches union all select 'financial_movements', count(*) from public.financial_movements union all select 'financial_operations', count(*) from public.financial_operations union all select 'audit_logs', count(*) from public.audit_logs order by 1" | Tee-Object -FilePath $log -Append
"Constraint, index, sequence, and RLS counts:" | Tee-Object -FilePath $log -Append
Invoke-Verification "select 'primary_keys',count(*) from pg_constraint where contype='p' and connamespace='public'::regnamespace union all select 'foreign_keys',count(*) from pg_constraint where contype='f' and connamespace='public'::regnamespace union all select 'indexes',count(*) from pg_indexes where schemaname='public' union all select 'sequences',count(*) from pg_class where relnamespace='public'::regnamespace and relkind='S' union all select 'rls_tables',count(*) from pg_tables where schemaname='public' and rowsecurity union all select 'policies',count(*) from pg_policies where schemaname='public'" | Tee-Object -FilePath $log -Append
"Foreign-key validation status:" | Tee-Object -FilePath $log -Append
Invoke-Verification "select conname, convalidated from pg_constraint where contype='f' and connamespace='public'::regnamespace order by conname" | Tee-Object -FilePath $log -Append
