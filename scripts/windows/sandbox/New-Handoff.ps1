param([Parameter(Mandatory)][string]$Inputs,[Parameter(Mandatory)][string]$Destination)
$ErrorActionPreference='Stop'
if(Test-Path -LiteralPath $Destination){throw 'Choose a new handoff directory'}
if((node -p process.versions.node) -ne '22.23.5'){throw 'Use the verified Node 22.23.5 runtime on the build workstation'}
$files=@('node-v22.23.5-x64.msi','mongodb-server-9.0-x64.zip','mongosh-2.14.2-win32-x64.zip','mongodb-database-tools-windows-x86_64-100.20.1.zip')
$hashes=Get-Content -LiteralPath (Join-Path $Inputs 'approved-sha256.json') -Raw|ConvertFrom-Json
foreach($file in $files){
 $hash=$hashes.$file
 if($hash -notmatch '^[0-9A-Fa-f]{64}$' -or (Get-FileHash -LiteralPath (Join-Path $Inputs $file)).Hash -ne $hash){throw "Missing or mismatched approved hash: $file"}
}
$repo=(Resolve-Path "$PSScriptRoot/../../..").Path
Push-Location $repo
try {
 $output=& ./scripts/windows/Build-Package.ps1 -Version 0.0.1 -Channel staging
 $bundle=@($output)[-1]
 if(!$bundle -or !(Test-Path -LiteralPath (Join-Path $bundle 'release.json'))){throw 'Package build did not produce a manifest'}
 node scripts/windows/sandbox/sign-lab.mjs $bundle
 if($LASTEXITCODE){throw 'Lab signing failed'}
 $dest=New-Item -ItemType Directory -Path $Destination
 New-Item -ItemType Directory "$dest/inputs","$dest/bundle","$dest/scripts"|Out-Null
 foreach($file in $files){Copy-Item -LiteralPath (Join-Path $Inputs $file) "$dest/inputs"}
 Copy-Item -LiteralPath (Join-Path $Inputs 'approved-sha256.json') "$dest/inputs"
 foreach($file in 'oarlinks.zip','release.json','release.sig','release-public.pem'){Copy-Item -LiteralPath (Join-Path $bundle $file) "$dest/bundle"}
 Copy-Item scripts/windows/*.ps1,scripts/windows/*.mjs,scripts/windows/*.js "$dest/scripts"
 Copy-Item scripts/windows/sandbox/Install-Prerequisites.ps1 "$dest/scripts"
 Copy-Item docs/windows-sandbox-rehearsal.md "$dest/README.md"
 $escaped=[Security.SecurityElement]::Escape($dest.FullName)
 @"
<Configuration>
  <Networking>Disable</Networking>
  <ClipboardRedirection>Enable</ClipboardRedirection>
  <MappedFolders><MappedFolder><HostFolder>$escaped</HostFolder><SandboxFolder>C:\OarLinksLab</SandboxFolder><ReadOnly>true</ReadOnly></MappedFolder></MappedFolders>
</Configuration>
"@ | Set-Content "$dest/OarLinks-Lab.wsb"
 Write-Output ('Lab public-key SHA-256: '+(Get-FileHash "$dest/bundle/release-public.pem").Hash)
} finally {Pop-Location}
