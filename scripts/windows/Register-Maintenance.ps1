#Requires -RunAsAdministrator
param([Parameter(Mandatory)][string]$BackupDestination,[Parameter(Mandatory)][string]$RecipientCertificate,[switch]$EnableAutomaticApply)
if($EnableAutomaticApply){throw 'Automatic application is disabled pending VM acceptance.'}
$ErrorActionPreference='Stop'
$root=Join-Path $env:ProgramData 'OarLinksBusiness'
if(!(Get-ScheduledTask -TaskName OarLinksBusiness -ErrorAction SilentlyContinue)){throw 'Install the launcher first'}
foreach($value in @($root,$BackupDestination,$RecipientCertificate)){if($value -match '["\r\n]'){throw 'Invalid path'}}
if(!(Test-Path $BackupDestination -PathType Container) -or !(Test-Path $RecipientCertificate -PathType Leaf)){throw 'Backup location and encryption recipient required'}
$engine=Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$principal=New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
$settings=New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Hours 2)
$args='-NoLogo -NoProfile -NonInteractive -File "'+$root+'\runtime\Update.ps1"'
Register-ScheduledTask -TaskName OarLinksUpdate -Principal $principal -Settings $settings -Trigger (New-ScheduledTaskTrigger -Daily -At '02:15') -Action (New-ScheduledTaskAction -Execute $engine -Argument $args) -Force|Out-Null
# Persistent backups are separately scheduled. Take them during the same closed-hours period.
Register-ScheduledTask -TaskName OarLinksBackup -Principal $principal -Settings $settings -Trigger (New-ScheduledTaskTrigger -Daily -At '03:30') -Action (New-ScheduledTaskAction -Execute $engine -Argument ('-NoLogo -NoProfile -NonInteractive -File "'+$root+'\runtime\Backup.ps1" -Destination "'+$BackupDestination+'" -RecipientCertificate "'+$RecipientCertificate+'"')) -Force|Out-Null
