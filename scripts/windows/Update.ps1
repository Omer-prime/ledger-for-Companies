#Requires -RunAsAdministrator
param([switch]$Apply,[string]$BackupDestination,[string]$RecipientCertificate)
if($Apply){throw 'Automatic application is disabled in this review build pending VM recovery acceptance.'}
$ErrorActionPreference='Stop'
$root=Join-Path $env:ProgramData 'OarLinksBusiness'
$config=Get-Content "$root/config/runtime.json" -Raw|ConvertFrom-Json
$node=$config.node
$channel=(Get-Content "$root/config/channel.txt" -Raw).Trim()
if($channel -notin 'stable','staging'){throw 'Invalid channel'}
$mutex=[Threading.Mutex]::new($false,'Global\OarLinksReleaseUpdate')
if(!$mutex.WaitOne(0)){throw 'An update check is already running'}
function Status([string]$Message){
 @{status=$Message;at=[datetime]::UtcNow.ToString('o')}|ConvertTo-Json|Set-Content "$root/logs/update.json" -Encoding utf8
}
$stage=$null
try {
 $previous=(Get-Content "$root/active.txt" -Raw).Trim()
 $release=Invoke-RestMethod "https://api.github.com/repos/Omer-prime/ledger-for-Companies/releases?per_page=30" -TimeoutSec 30
 $release=@($release | Where-Object {$_.tag_name -match ("^oarlinks-"+$channel+"-[0-9]+\.[0-9]+\.[0-9]+$") -and !$_.draft -and ($channel -eq "staging" -or !$_.prerelease)} | Sort-Object { [version]($_.tag_name -replace "^oarlinks-(stable|staging)-","") } -Descending)[0]
 if(!$release -or $release.draft -or ($channel -eq 'stable' -and $release.prerelease)){throw 'Release is not published on the approved channel'}
 $stage=Join-Path "$root/staging" ([guid]::NewGuid().ToString())
 New-Item -ItemType Directory $stage|Out-Null
 foreach($asset in 'release.json','release.sig','oarlinks.zip'){
  $uri="https://github.com/Omer-prime/ledger-for-Companies/releases/download/$($release.tag_name)/$asset"
  & curl.exe --silent --show-error --fail --location --proto '=https' --proto-redir '=https' --max-time 600 --max-filesize 1500000000 -o "$stage/$asset" $uri
  if($LASTEXITCODE){throw 'Release download failed'}
 }
 $meta=& $node "$root/runtime/release.mjs" verify "$stage/release.json" "$stage/release.sig" "$root/config/release-public.pem" "$stage/oarlinks.zip" $channel
 if($LASTEXITCODE){throw 'Release verification failed'}
 $version=($meta|ConvertFrom-Json).version
 if($release.tag_name -ne "oarlinks-$channel-$version"){throw "Release tag and signed version differ"}
 & $node "$root/runtime/release.mjs" newer $version $previous
 if($LASTEXITCODE -eq 2){Status "Current version $previous";return}
 if($LASTEXITCODE){throw 'Invalid version'}
 Status "Approved release $version verified; installed $previous"
} catch {
 Status 'Update check failed; contact support'
 throw 'Could not verify an approved release'
} finally {
 if($stage -and $stage.StartsWith("$root\staging\",[StringComparison]::OrdinalIgnoreCase)){
  foreach($asset in 'release.json','release.sig','oarlinks.zip'){if(Test-Path "$stage/$asset"){Remove-Item -LiteralPath "$stage/$asset"}}
  Remove-Item -LiteralPath $stage
 }
 $mutex.ReleaseMutex()
 $mutex.Dispose()
}
