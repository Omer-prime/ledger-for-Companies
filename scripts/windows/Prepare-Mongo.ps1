#Requires -RunAsAdministrator
param([Parameter(Mandatory)][string]$MongoBin,[Parameter(Mandatory)][string]$MongoSettings)
$ErrorActionPreference='Stop'
# The operator supplies an approved X.509 MongoDB config; no development keyfile or auth downgrade.
$cfg=Get-Content -LiteralPath $MongoSettings -Raw|ConvertFrom-Json
if($cfg.port -ne 37441 -or $cfg.replicaSet -ne 'oarlinks'){throw 'Wrong MongoDB port or replica set'}
foreach($key in 'memberCertificate','caCertificate'){if(!(Test-Path -LiteralPath $cfg.$key -PathType Leaf) -or $cfg.$key -match '[\r\n"]'){throw 'Verified MongoDB PEM certificate paths are required'}}
if(Get-Service OarLinksMongo -ErrorAction SilentlyContinue){throw 'Existing Mongo service; do not overwrite it'}
if(Get-NetTCPConnection -LocalPort 37441 -State Listen -ErrorAction SilentlyContinue){throw 'Mongo port in use'}
$root=Join-Path $env:ProgramData 'OarLinksMongo'
if(Test-Path $root){throw 'Existing Mongo files found'}
New-Item -ItemType Directory $root|Out-Null
& icacls.exe $root /inheritance:r /grant:r '*S-1-5-18:(OI)(CI)F' '*S-1-5-32-544:(OI)(CI)F' '*S-1-5-20:(OI)(CI)M'|Out-Null
if($LASTEXITCODE){throw 'Mongo ACL setup failed'}
New-Item -ItemType Directory "$root/data","$root/logs"|Out-Null
Copy-Item -LiteralPath $cfg.memberCertificate "$root/member.pem"
Copy-Item -LiteralPath $cfg.caCertificate "$root/ca.pem"
# Local user traffic uses SCRAM; replication membership uses X.509. Bind exclusively to loopback.
@"
storage:
  dbPath: '$root\data'
systemLog:
  destination: file
  path: '$root\logs\mongod.log'
  logAppend: true
net:
  bindIp: localhost
  port: 37441
  tls:
    mode: preferTLS
    certificateKeyFile: '$root\member.pem'
    CAFile: '$root\ca.pem'
security:
  authorization: enabled
  clusterAuthMode: x509
replication:
  replSetName: oarlinks
"@|Set-Content "$root/mongod.yml" -Encoding ascii
$exe=(Resolve-Path (Join-Path $MongoBin 'mongod.exe')).Path
Write-Host 'Config prepared. Follow the reviewed Database Setup steps before starting MongoDB.'
