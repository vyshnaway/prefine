$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")
node scripts/run.mjs @args
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }