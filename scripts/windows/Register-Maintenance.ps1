#Requires -RunAsAdministrator
param([switch]$EnableAutomaticApply)
if($EnableAutomaticApply){throw 'Automatic application is disabled pending VM acceptance.'}
$ErrorActionPreference='Stop'
$root=Join-Path $env:ProgramData 'OarLinksBusiness'
if(!(Get-ScheduledTask -TaskName OarLinksBusiness -ErrorAction SilentlyContinue)){throw 'Install the launcher first'}
foreach($value in @($root)){if($value -match '["\r\n]'){throw 'Invalid path'}}
$engine=Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$principal=New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
$settings=New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Hours 2)
$args='-NoLogo -NoProfile -NonInteractive -File "'+$root+'\runtime\Update.ps1"'
Register-ScheduledTask -TaskName OarLinksUpdate -Principal $principal -Settings $settings -Trigger (New-ScheduledTaskTrigger -Daily -At '02:15') -Action (New-ScheduledTaskAction -Execute $engine -Argument $args) -Force|Out-Null
