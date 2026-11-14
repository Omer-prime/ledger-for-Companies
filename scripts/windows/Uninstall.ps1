#Requires -RunAsAdministrator
$ErrorActionPreference='Stop'
$root=Join-Path $env:ProgramData 'OarLinksBusiness'
if(!(Test-Path "$root/config/runtime.json")){throw 'No recorded OarLinks installation found.'}
if(Get-ScheduledTask -TaskName OarLinksBusiness -ErrorAction SilentlyContinue){
 Stop-ScheduledTask -TaskName OarLinksBusiness
 Unregister-ScheduledTask -TaskName OarLinksBusiness -Confirm:$false
}
foreach($task in 'OarLinksUpdate','OarLinksBackup'){
 if(Get-ScheduledTask -TaskName $task -ErrorAction SilentlyContinue){
  Stop-ScheduledTask -TaskName $task
  Unregister-ScheduledTask -TaskName $task -Confirm:$false
 }
}
$shortcut=Join-Path ([Environment]::GetFolderPath('CommonDesktopDirectory')) 'OarLinks Business.url'
if((Test-Path $shortcut) -and ((Get-Content $shortcut) -contains 'URL=https://localhost:37443')){Remove-Item -LiteralPath $shortcut}
$thumb=(Get-Content "$root/config/runtime.json" -Raw|ConvertFrom-Json).thumbprint
if($thumb -match '^[A-Fa-f0-9]{40}$'){foreach($store in 'Root','My'){ $item="Cert:\LocalMachine\$store\$thumb"; if(Test-Path $item){Remove-Item -LiteralPath $item} }}
Write-Host 'Launcher removed. Releases, configuration, backups and MongoDB data were retained.'
