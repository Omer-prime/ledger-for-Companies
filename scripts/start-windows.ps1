param([ValidateRange(1024,65535)][int]$Port=3000)
$ErrorActionPreference='Stop'
Set-Location (Join-Path $PSScriptRoot '..')
if (!(Test-Path -LiteralPath '.next/BUILD_ID')) { throw 'Build the approved application before starting it.' }
if (!(Test-Path -LiteralPath '.env.production.local')) { throw 'Configure the protected production environment file first.' }
$env:OARLINKS_POS_FIXTURE='0'
& node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port $Port
exit $LASTEXITCODE
