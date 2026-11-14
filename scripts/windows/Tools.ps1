function Resolve-OarLinksTool([string]$Path,[string]$Name) {
 if(![IO.Path]::IsPathRooted($Path) -or [IO.Path]::GetFileName($Path) -ine $Name){throw "Supply the absolute approved path to $Name"}
 $tool=Get-Item -LiteralPath $Path -ErrorAction Stop
 if($tool.PSIsContainer -or ($tool.Attributes -band [IO.FileAttributes]::ReparsePoint)){throw "Invalid tool: $Name"}
 return $tool.FullName
}
