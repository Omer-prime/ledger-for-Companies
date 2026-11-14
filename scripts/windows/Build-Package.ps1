param([Parameter(Mandatory)][string]$Version,[Parameter(Mandatory)][ValidateSet('stable','staging')][string]$Channel)
$ErrorActionPreference='Stop'
if($Version -notmatch '^(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})$'){throw 'Use a numeric release version'}
if([Environment]::OSVersion.Platform -ne 'Win32NT' -or -not [Environment]::Is64BitOperatingSystem){throw 'Windows x64 required'}
if(git status --porcelain){throw 'A clean checkout is required'}
if($LASTEXITCODE){throw 'Git unavailable'}
if(Get-ChildItem -Force -File -Filter '.env*' | Where-Object {$_.Name -notin '.env.example','.env.sample'}){throw 'Package only from a checkout without runtime environment files'}
$commit=git rev-parse HEAD
$nodeVersion=node -p process.versions.node
if($nodeVersion -notmatch '^22\.'){throw 'Reviewed Node 22 runtime required'}
npm ci --ignore-scripts
if($LASTEXITCODE){throw 'Dependency installation failed'}
npm run lint -- src tests scripts/windows
if($LASTEXITCODE){throw 'Lint failed'}
$env:NEXT_TELEMETRY_DISABLED='1'
npm run build
if($LASTEXITCODE){throw 'Build failed'}
node node_modules/typescript/bin/tsc --noEmit
if($LASTEXITCODE){throw 'TypeScript failed'}
$dest=Join-Path ([IO.Path]::GetTempPath()) ('oarlinks-'+[guid]::NewGuid())
New-Item -ItemType Directory "$dest/app"|Out-Null
Copy-Item scripts/windows/provision-admin.mjs,src/lib/password.ts "$dest/app"
Copy-Item package.json,package-lock.json "$dest/app"
Copy-Item .next,node_modules,public "$dest/app" -Recurse
tar.exe -acf "$dest/oarlinks.zip" --exclude=app/.next/cache --exclude=app/.next/diagnostics -C $dest app
if($LASTEXITCODE){throw 'Archive creation failed'}
[ordered]@{version=$Version;channel=$Channel;platform='win32-x64';dataEpoch=1;rollbackCompatible=$true;commit=$commit;nodeVersion=$nodeVersion;sha256=(Get-FileHash "$dest/oarlinks.zip").Hash.ToLowerInvariant()}|ConvertTo-Json|Set-Content "$dest/release.json" -Encoding utf8NoBOM
Write-Output $dest
