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

$pgDump = Get-Command pg_dump -ErrorAction SilentlyContinue
if (-not $pgDump) {
  throw 'pg_dump nao encontrado. Instale o cliente PostgreSQL antes de executar o baseline.'
}

New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null
$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$outputFile = Join-Path $OutputDirectory "public-schema-$timestamp.sql"

$arguments = @(
  '--schema-only',
  '--schema=public',
  '--no-owner',
  '--quote-all-identifiers',
  '--host', $env:PGHOST,
  '--port', $env:PGPORT,
  '--username', $env:PGUSER,
  '--dbname', $env:PGDATABASE,
  '--file', $outputFile
)

Write-Host 'Exportando somente o schema public. Nenhuma alteracao sera aplicada ao banco.'
& $pgDump.Source @arguments
if ($LASTEXITCODE -ne 0) {
  throw "pg_dump falhou com codigo $LASTEXITCODE. O arquivo parcial nao deve ser usado."
}

Write-Host "Baseline criado em: $outputFile"
Write-Host 'Revise o arquivo antes de versionar e confirme que ele nao contem dados ou credenciais.'
