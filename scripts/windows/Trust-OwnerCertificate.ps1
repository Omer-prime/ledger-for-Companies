param([Parameter(Mandatory)][string]$Certificate,[Parameter(Mandatory)][string]$ExpectedSha256)
$ErrorActionPreference='Stop'
$cert=(Resolve-Path -LiteralPath $Certificate).Path
if($ExpectedSha256 -notmatch '^[0-9a-fA-F]{64}$' -or (Get-FileHash -LiteralPath $cert).Hash -ne $ExpectedSha256){throw 'Certificate fingerprint does not match the technician record'}
$leaf=[System.Security.Cryptography.X509Certificates.X509Certificate2]::new($cert)
if($leaf.Subject -ne 'CN=localhost' -or $leaf.NotAfter -le (Get-Date)){throw 'Unexpected or expired localhost certificate'}
Import-Certificate -FilePath $cert -CertStoreLocation Cert:\CurrentUser\Root|Out-Null
Write-Host 'Trust added for this Windows user only.'
