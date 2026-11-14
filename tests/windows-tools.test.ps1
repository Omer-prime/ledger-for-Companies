$ErrorActionPreference='Stop'
. "$PSScriptRoot/../scripts/windows/Tools.ps1"
$node=Get-Command node.exe -CommandType Application | Select-Object -First 1
if((Resolve-OarLinksTool $node.Source 'node.exe') -ne $node.Source){throw 'Absolute tool lookup failed'}
foreach($case in @(@('node.exe','node.exe'),@($node.Source,'mongod.exe'))){
 $accepted=$false
 try {Resolve-OarLinksTool $case[0] $case[1]|Out-Null;$accepted=$true}catch {}
 if($accepted){throw 'Unexpected executable accepted'}
}
foreach($file in Get-ChildItem "$PSScriptRoot/../scripts/windows" -Filter '*.ps1'){
 $tokens=$null;$issues=$null
 [Management.Automation.Language.Parser]::ParseFile($file.FullName,[ref]$tokens,[ref]$issues)|Out-Null
 if($issues){throw ($issues|Out-String)}
}
Write-Output 'Explicit executable path tests and Windows deployment script parsing passed'
