[CmdletBinding()]
param(
  [string]$OutputDirectory = (Join-Path (Split-Path $PSScriptRoot -Parent) 'baseline')
)

$ErrorActionPreference = 'Stop'

$requiredVariables = @('PGHOST', 'PGPORT', 'PGDATABASE', 'PGUSER', 'PGPASSWORD')
$missingVariables = $requiredVariables | Where-Object { -not (Get-Item "Env:$_" -ErrorAction SilentlyContinue).Value }
if ($missingVariables.Count -gt 0) {
  throw "Variaveis de conexao ausentes: $($missingVariables -join ', '). Consulte docs/SUPABASE_BASELINE.md."
}

$psql = Get-Command psql -ErrorAction SilentlyContinue
if (-not $psql) {
  throw 'psql nao encontrado. Instale o cliente PostgreSQL antes de executar a auditoria.'
}

New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null
$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$outputFile = Join-Path $OutputDirectory "structural-audit-$timestamp.txt"
$sqlFile = Join-Path $PSScriptRoot 'verify-structural-divergences.sql'

$arguments = @(
  '--no-password',
  '--set', 'ON_ERROR_STOP=1',
  '--host', $env:PGHOST,
  '--port', $env:PGPORT,
  '--username', $env:PGUSER,
  '--dbname', $env:PGDATABASE,
  '--file', $sqlFile
)

Write-Host 'Executando auditoria em transacao READ ONLY.'
& $psql.Source @arguments 2>&1 | Tee-Object -FilePath $outputFile
if ($LASTEXITCODE -ne 0) {
  throw "Auditoria falhou com codigo $LASTEXITCODE. Consulte o relatorio parcial."
}

Write-Host "Relatorio criado em: $outputFile"
