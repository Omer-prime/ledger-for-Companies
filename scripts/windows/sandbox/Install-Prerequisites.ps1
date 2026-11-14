#Requires -RunAsAdministrator
param([Parameter(Mandatory)][switch]$ConfirmDisposableSandbox)
$ErrorActionPreference='Stop'
if(!$ConfirmDisposableSandbox -or $env:USERNAME -ne 'WDAGUtilityAccount' -or !(Test-Path 'C:\OarLinksLab\OarLinks-Lab.wsb')){throw 'Run this only inside the mapped disposable Windows Sandbox'}
$inputDir='C:\OarLinksLab\inputs'
$hashes=Get-Content "$inputDir/approved-sha256.json" -Raw|ConvertFrom-Json
$root='C:\OarLinksLabTools'
if(Test-Path $root){throw 'Use a fresh Sandbox'}
$msi='node-v22.23.5-x64.msi'
$zips=@{'mongodb-server-9.0-x64.zip'='server';'mongosh-2.14.2-win32-x64.zip'='shell';'mongodb-database-tools-windows-x86_64-100.20.1.zip'='tools'}
foreach($file in @($msi)+@($zips.Keys)){
 if($hashes.$file -notmatch '^[0-9a-fA-F]{64}$' -or (Get-FileHash "$inputDir/$file").Hash -ne $hashes.$file){throw "Prerequisite hash mismatch: $file"}
}
$installed=Start-Process "$env:SystemRoot\System32\msiexec.exe" -ArgumentList '/i',"C:\OarLinksLab\inputs\$msi",'/qn','/norestart' -Wait -PassThru -WindowStyle Hidden
if($installed.ExitCode -notin 0,3010){throw "Node installer failed: $($installed.ExitCode)"}
foreach($file in $zips.Keys){Expand-Archive -LiteralPath "$inputDir/$file" -DestinationPath "$root/$($zips[$file])"}
$node="$env:ProgramFiles\nodejs\node.exe"
if((& $node --version) -ne 'v22.23.5'){throw 'Unexpected Node version'}
$expected=@{'mongod.exe'='\bv9\.0\.';'mongosh.exe'='\b2\.14\.2\b';'mongodump.exe'='\b100\.20\.1\b';'mongorestore.exe'='\b100\.20\.1\b'}
foreach($name in $expected.Keys){
 $matches=@(Get-ChildItem $root -Filter $name -File -Recurse)
 if($matches.Count -ne 1){throw "Expected one $name"}
 $version=& $matches[0].FullName --version
 if($LASTEXITCODE -or ($version -join ' ') -notmatch $expected[$name]){throw "Unexpected version: $name"}
 Write-Output ($matches[0].FullName+': '+($version|Select-Object -First 1))
}
if($installed.ExitCode -eq 3010){Write-Output 'Node requested an internal Sandbox restart before continuing.'}
