$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")
node scripts/setup.mjs @args
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }