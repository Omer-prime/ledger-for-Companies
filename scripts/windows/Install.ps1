#Requires -RunAsAdministrator
param(
 [Parameter(Mandatory)][string]$Bundle,
 [Parameter(Mandatory)][string]$PublicKey,
 [Parameter(Mandatory)][string]$PublicKeySha256,
 [Parameter(Mandatory)][string]$AppEnvironment,
 [ValidateSet('stable','staging')][string]$Channel='stable'
)
$ErrorActionPreference='Stop'
if(-not [Environment]::Is64BitProcess -or $env:PROCESSOR_ARCHITECTURE -ne 'AMD64' -or [Environment]::OSVersion.Version.Build -lt 26100){throw 'Use a supported Windows 11 x64 installation (24H2 or later).'}
if((Get-PSDrive -Name $env:ProgramData.Substring(0,1)).Free -lt 15GB){throw 'At least 15 GB free space is required.'}
$node=(Get-Command node.exe -CommandType Application).Source
if($node -notlike "$env:ProgramFiles\nodejs\*"){throw 'Install the reviewed machine-wide Node MSI first.'}
$root=Join-Path $env:ProgramData 'OarLinksBusiness'
if(Test-Path -LiteralPath $root){throw 'Existing OarLinks directory found. Use the update/recovery procedure; setup will not overwrite it.'}
foreach($port in 37442,37443){if(Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue){throw "Port $port is already in use."}}
if((Get-ScheduledTask -TaskName OarLinksBusiness -ErrorAction SilentlyContinue)){throw 'An OarLinks task already exists.'}
$shortcut=Join-Path ([Environment]::GetFolderPath('CommonDesktopDirectory')) 'OarLinks Business.url'
if(Test-Path $shortcut){throw 'An OarLinks desktop shortcut already exists.'}
if((Get-FileHash -LiteralPath $PublicKey).Hash -ne $PublicKeySha256){throw 'Signing key fingerprint mismatch'}
$meta=& $node "$PSScriptRoot/release.mjs" verify "$Bundle/release.json" "$Bundle/release.sig" $PublicKey "$Bundle/oarlinks.zip" $Channel
if($LASTEXITCODE){throw 'Package verification failed'}
$release=$meta|ConvertFrom-Json
$settings=Get-Content -LiteralPath $AppEnvironment -Raw|ConvertFrom-Json
if($settings.APP_ORIGIN -ne 'https://localhost:37443' -or
   $settings.MONGODB_DATABASE -notmatch '^oarlinks_[a-z0-9_]{1,48}$' -or
   $settings.MONGODB_URI -notmatch '^mongodb://[^:/@]+:[^/@]+@localhost:37441/\?replicaSet=oarlinks&authSource=[a-z0-9_]+$'){
 throw 'Use the dedicated authenticated OarLinks replica set and exact HTTPS origin.'
}
# Check TLS/DB prerequisite availability before materializing an installation.
$client=New-Object System.Net.Sockets.TcpClient
try {$client.Connect('localhost',37441)} finally {$client.Dispose()}
New-Item -ItemType Directory $root|Out-Null
function Protect($Path,[string]$Grant){
 & icacls.exe $Path /inheritance:r /grant:r '*S-1-5-18:(OI)(CI)F' '*S-1-5-32-544:(OI)(CI)F' $Grant | Out-Null
 if($LASTEXITCODE){throw 'Could not protect installation directory.'}
}
Protect $root '*S-1-5-19:(OI)(CI)RX'
New-Item -ItemType Directory "$root/config","$root/logs","$root/releases","$root/staging","$root/recovery","$root/runtime"|Out-Null
Protect "$root/recovery" '*S-1-5-32-544:(OI)(CI)F'
Copy-Item "$PSScriptRoot/host.mjs","$PSScriptRoot/release.mjs","$PSScriptRoot/Backup.ps1","$PSScriptRoot/Update.ps1" "$root/runtime"
Copy-Item -LiteralPath $PublicKey "$root/config/release-public.pem"
$settings|ConvertTo-Json|Set-Content "$root/config/app-env.json" -Encoding utf8
Expand-Archive -LiteralPath "$Bundle/oarlinks.zip" -DestinationPath "$root/releases/$($release.version)"
Set-Content "$root/active.txt" $release.version -Encoding ascii
Set-Content "$root/config/channel.txt" $Channel -Encoding ascii
$cert=New-SelfSignedCertificate -DnsName localhost -CertStoreLocation Cert:\LocalMachine\My -NotAfter (Get-Date).AddYears(1) -FriendlyName 'OarLinks loopback HTTPS'
$tlsPassword=[guid]::NewGuid().ToString('N')+[guid]::NewGuid().ToString('N')
Export-PfxCertificate -Cert $cert -FilePath "$root/config/localhost.pfx" -Password (ConvertTo-SecureString $tlsPassword -AsPlainText -Force)|Out-Null
Export-Certificate -Cert $cert -FilePath "$root/config/localhost.cer"|Out-Null
Import-Certificate -FilePath "$root/config/localhost.cer" -CertStoreLocation Cert:\LocalMachine\Root|Out-Null
@{tlsPassword=$tlsPassword;thumbprint=$cert.Thumbprint;node=$node}|ConvertTo-Json|Set-Content "$root/config/runtime.json" -Encoding utf8
$action=New-ScheduledTaskAction -Execute $node -Argument ('"'+$root+'\runtime\host.mjs" "'+$root+'"')
$principal=New-ScheduledTaskPrincipal -UserId 'NT AUTHORITY\LOCAL SERVICE' -LogonType ServiceAccount -RunLevel Limited
$taskSettings=New-ScheduledTaskSettingsSet -RestartCount 5 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([timespan]::Zero) -MultipleInstances IgnoreNew -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName OarLinksBusiness -Action $action -Principal $principal -Settings $taskSettings -Trigger (New-ScheduledTaskTrigger -AtStartup)|Out-Null
@('[InternetShortcut]','URL=https://localhost:37443','IconFile='+$env:SystemRoot+'\System32\shell32.dll','IconIndex=15')|Set-Content $shortcut -Encoding ascii
$email=Read-Host 'Initial owner email'
$password=Read-Host 'Unique owner password (at least 16 characters)' -AsSecureString
$bstr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($password)
try {
 $plain=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
 @{email=$email;password=$plain}|ConvertTo-Json -Compress|& $node --experimental-strip-types "$root/releases/$($release.version)/app/provision-admin.mjs" "$root/config/app-env.json"
 if($LASTEXITCODE){throw 'Administrator setup failed; installation is not ready'}
} finally {
 $plain=$null
 [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
}
Start-ScheduledTask -TaskName OarLinksBusiness
$started=$false
for($i=0;$i -lt 30;$i++){
 $status=& curl.exe --silent --max-time 2 -o NUL -w '%{http_code}' https://localhost:37443/api/auth/me
 if($status -eq '401'){$started=$true;break}
 Start-Sleep 1
}
if(!$started){throw 'Trusted HTTPS health check failed. Retain files and investigate before handover.'}
Write-Host 'Open OarLinks Business on the desktop. Complete the HTTPS and sign-in checks before handing it to the owner.'
