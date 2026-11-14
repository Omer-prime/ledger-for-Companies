#Requires -RunAsAdministrator
param([Parameter(Mandatory)][string]$Destination,[Parameter(Mandatory)][string]$RecipientCertificate)
$ErrorActionPreference='Stop'
$root=Join-Path $env:ProgramData 'OarLinksBusiness'
$config=Get-Content "$root/config/app-env.json" -Raw|ConvertFrom-Json
if($config.MONGODB_DATABASE -notmatch '^oarlinks_[a-z0-9_]{1,48}$' -or $config.MONGODB_URI -notmatch '^mongodb://[^:/@]+:[^/@]+@localhost:37441/\?replicaSet=oarlinks&authSource=[a-z0-9_]+$'){throw 'Unexpected MongoDB configuration'}
if(!(Test-Path -LiteralPath $Destination -PathType Container)){throw 'Configure a protected backup destination first'}
$work=Join-Path "$root/recovery" ([guid]::NewGuid().ToString())
New-Item -ItemType Directory $work|Out-Null
try {
 $archive="$work/backup.archive"
 @{uri=$config.MONGODB_URI}|ConvertTo-Json|Set-Content "$work/tool.yml" -Encoding ascii
 & mongodump.exe --config "$work/tool.yml" --db $config.MONGODB_DATABASE "--archive=$archive" --gzip 2>$null
 if($LASTEXITCODE -or !(Test-Path $archive)){throw 'MongoDB backup failed'}
 $bytes=[IO.File]::ReadAllBytes($archive)
 $packet=@{ database=$config.MONGODB_DATABASE; sha256=(Get-FileHash $archive).Hash; archive=[Convert]::ToBase64String($bytes) }|ConvertTo-Json -Compress
 $name='oarlinks-'+[DateTime]::UtcNow.ToString('yyyyMMddTHHmmssZ')+'-'+[guid]::NewGuid().ToString('N')
 $temp=Join-Path $Destination ($name+'.partial')
 Protect-CmsMessage -To $RecipientCertificate -Content $packet -OutFile $temp
 if(!(Get-Item $temp).Length){throw 'Encrypted backup is empty'}
 $digest=(Get-FileHash $temp).Hash
 Move-Item -LiteralPath $temp -Destination (Join-Path $Destination ($name+'.cms'))
 if((Get-FileHash (Join-Path $Destination ($name+'.cms'))).Hash -ne $digest){throw 'Encrypted backup copy verification failed'}
 Set-Content (Join-Path $Destination ($name+'.sha256')) $digest -Encoding ascii
} finally {
 foreach($file in 'tool.yml','backup.archive'){if(Test-Path "$work/$file"){Remove-Item -LiteralPath "$work/$file" -Force}}
 Remove-Item -LiteralPath $work
}
