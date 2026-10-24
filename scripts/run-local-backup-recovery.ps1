$ErrorActionPreference = 'Stop'

$pgBin = 'C:\Program Files\PostgreSQL\17\bin'
$psql = Join-Path $pgBin 'psql.exe'
$pgRestore = Join-Path $pgBin 'pg_restore.exe'
$backup = 'D:\Sokoon\backups\Skoon_Full_Backup.dump'
$database = 'skoon_recovery_20261024_20261024_public'
$log = 'D:\Sokoon\docs\BACKUP_RECOVERY_PUBLIC_SCHEMA.log'

function Invoke-LocalPsql([string]$sql, [string]$targetDatabase = 'postgres') {
  & $psql -X -W -h 127.0.0.1 -p 4444 -U postgres -d $targetDatabase -v ON_ERROR_STOP=1 -Atc $sql
  if ($LASTEXITCODE -ne 0) { throw "psql failed with exit code $LASTEXITCODE" }
}

"Recovery database: $database" | Tee-Object -FilePath $log
"Started UTC: $([DateTime]::UtcNow.ToString('o'))" | Tee-Object -FilePath $log -Append
"PostgreSQL privilege check:" | Tee-Object -FilePath $log -Append
Invoke-LocalPsql "select version(), current_user, current_setting('port'), rolcreatedb, rolsuper from pg_roles where rolname = current_user" | Tee-Object -FilePath $log -Append

$exists = Invoke-LocalPsql "select exists(select 1 from pg_database where datname = '$database')"
if ($exists -ne 'f') { throw "Refusing to use existing database $database" }

"Creating isolated database $database" | Tee-Object -FilePath $log -Append
Invoke-LocalPsql "create database $database"

"Starting public-schema-only restore with --exit-on-error (no ownership or constraint suppression)" | Tee-Object -FilePath $log -Append
$previousErrorActionPreference = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
# Do not pipe or redirect pg_restore: its native password prompt requires the
# interactive console's stdin. The exit code is retained below.
& $pgRestore -W --exit-on-error --verbose --schema public --host 127.0.0.1 --port 4444 --username postgres --dbname $database $backup
$restoreExitCode = $LASTEXITCODE
$ErrorActionPreference = $previousErrorActionPreference
"pg_restore_exit=$restoreExitCode" | Tee-Object -FilePath $log -Append
if ($restoreExitCode -ne 0) { exit $restoreExitCode }

"Critical table row counts:" | Tee-Object -FilePath $log -Append
Invoke-LocalPsql "select relname, n_live_tup from pg_stat_user_tables where relname in ('orders','payments','shifts','inventory_items','inventory_batches','financial_movements','financial_operations','audit_logs') order by relname" $database | Tee-Object -FilePath $log -Append
"Primary/foreign key/index/RLS counts:" | Tee-Object -FilePath $log -Append
Invoke-LocalPsql "select 'pk', count(*) from pg_constraint where contype='p' union all select 'fk', count(*) from pg_constraint where contype='f' union all select 'indexes', count(*) from pg_indexes where schemaname='public' union all select 'rls_tables', count(*) from pg_tables where schemaname='public' and rowsecurity" $database | Tee-Object -FilePath $log -Append
"Completed UTC: $([DateTime]::UtcNow.ToString('o'))" | Tee-Object -FilePath $log -Append
