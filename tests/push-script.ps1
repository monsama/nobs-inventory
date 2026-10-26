# Tests of the push script's helpers, run with PowerShell 7 (pwsh tests/push-script.ps1). The script is loaded as functions
# only, and Lansweeper's tables are DataTables, so no database is needed.
$ErrorActionPreference = 'Stop'
$t = $null; $e = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot '..' 'scripts' 'Lansweeper-Push.ps1'), [ref]$t, [ref]$e)
# Only the functions: the script's own code would try to reach a database.
foreach ($f in $ast.FindAll({ $args[0] -is [System.Management.Automation.Language.FunctionDefinitionAst] }, $false)) { . ([scriptblock]::Create($f.Extent.Text)) }
$fails = 0
function Check($name, $got, $want) { if ("$got" -ne "$want") { Write-Host "FAIL $name : got '$got' want '$want'"; $script:fails++ } else { Write-Host "ok   $name" } }

Check 'date from datetime' (Get-DateText ([datetime]'2027-03-31')) '2027-03-31'
Check 'date 1900 is none' (Get-DateText ([datetime]'1900-01-01')) ''
Check 'date text' (Get-DateText '2026-11-02 00:00:00') '2026-11-02'
Check 'date empty' (Get-DateText ([DBNull]::Value)) ''
Check 'role 1' (Get-RoleText 1) 'workstation'
Check 'role 3' (Get-RoleText 3) 'server'
Check 'role 5' (Get-RoleText 5) 'dc'
Check 'role null' (Get-RoleText ([DBNull]::Value)) ''
Check 'chassis notebook' (Get-ChassisText 10) 'notebook'
Check 'chassis desktop' (Get-ChassisText '3') 'desktop'
Check 'chassis unknown' (Get-ChassisText 99) ''
Check 'os: full name and version' (Get-OsText 'Microsoft Windows 10 Pro' '10.0.19045' 'Win 10') 'Windows 10 Pro (10.0.19045)'
Check 'os: full name without version' (Get-OsText 'Microsoft Windows Server 2022 Standard' '' 'Win 2022') 'Windows Server 2022 Standard'
Check 'os: short name when there is no full one' (Get-OsText '' '' 'Win 10') 'Win 10'
Check 'os: none' (Get-OsText $null $null $null) ''
Check 'first v4' (Get-FirstV4 'fe80::1, 10.1.1.5') '10.1.1.5'
Check 'first v4 none' (Get-FirstV4 '0.0.0.0') ''
Check 'first v6 global' (Get-FirstV6 '10.1.1.5, fe80::5%12, 2001:DB8::42') '2001:db8::42'
Check 'first v6 link-local only' (Get-FirstV6 'fe80::1, ::1') ''

# A fake connection: each command answers with the rows of a DataTable.
function New-Table($cols, $rows) { $dt = New-Object System.Data.DataTable; foreach ($c in $cols) { [void]$dt.Columns.Add($c) }; foreach ($r in $rows) { $row = $dt.NewRow(); $row.ItemArray = [object[]]$r; $dt.Rows.Add($row) }; return , $dt }
function New-Conn($dt) {
  $conn = [pscustomobject]@{ Table = $dt }
  $conn | Add-Member ScriptMethod CreateCommand {
    $cmd = [pscustomobject]@{ CommandText = ''; CommandTimeout = 0; Table = $this.Table }
    $cmd | Add-Member ScriptMethod ExecuteReader { return ,($this.Table.CreateDataReader()) }
    return $cmd
  }
  return $conn
}
$script:Cols = @{ tblNetwork = @{ assetid = 'AssetID'; ipaddress = 'IPAddress'; ipsubnet = 'IPSubnet'; defaultipgateway = 'DefaultIPGateway'; dnsserversearchorder = 'DNSServerSearchOrder'; dhcpenabled = 'DHCPEnabled'; ipenabled = 'IPEnabled' };
                  tsysIPLocations = @{ iplocation = 'IPLocation'; startip = 'StartIP'; endip = 'EndIP' } }
$nics = New-Table @('n__AssetID','n__IPAddress','n__IPSubnet','n__DefaultIPGateway','n__DNSServerSearchOrder','n__DHCPEnabled') @(
  @('7', '192.168.56.1', '255.255.255.0', '', '', 'False'),
  @('7', '10.10.20.42, fe80::5', '255.255.255.0, 64', '10.10.20.1', '10.10.1.5,10.10.1.6', 'True'))
$map = Get-AdapterByAsset (New-Conn $nics)
Check 'adapters read' $map['7'].Count 2
$nic = Select-Adapter $map['7'] '10.10.20.42'
Check 'adapter by ip: mask' $nic['mask'] '255.255.255.0'
Check 'adapter by ip: gateway' $nic['gateway'] '10.10.20.1'
Check 'adapter by ip: dns' $nic['dns'] '10.10.1.5, 10.10.1.6'
Check 'adapter by ip: dhcp' $nic['dhcp'] 'dhcp'
Check 'adapter fallback has gateway' (Select-Adapter $map['7'] '1.2.3.4')['gateway'] '10.10.20.1'
# The other adapters: the main one, virtual ones and link-local addresses are left out, each address once.
$all = @(
  @{ ip = '10.10.20.42'; name = 'Intel Ethernet I219-LM'; mac = 'aa:bb:cc:00:00:01'; mask = '255.255.255.0'; gateway = '10.10.20.1'; dhcp = 'dhcp' },
  @{ ip = '10.50.0.7'; name = 'Intel Wi-Fi 6 AX201'; mac = 'aa:bb:cc:00:00:02'; mask = '255.255.0.0'; gateway = ''; dhcp = 'dhcp' },
  @{ ip = '10.50.0.7'; name = 'Intel Wi-Fi 6 AX201'; mac = 'aa:bb:cc:00:00:02'; mask = '255.255.0.0'; gateway = ''; dhcp = 'dhcp' },
  @{ ip = '172.17.80.1'; name = 'Hyper-V Virtual Ethernet Adapter'; mac = ''; mask = ''; gateway = ''; dhcp = 'static' },
  @{ ip = '169.254.10.2'; name = 'Realtek USB'; mac = ''; mask = ''; gateway = ''; dhcp = 'dhcp' })
$other = Get-OtherAdapters $all $all[0] '10.10.20.42'
Check 'other adapters: one' $other.Count 1
Check 'other adapters: the Wi-Fi' $other[0].name 'Intel Wi-Fi 6 AX201'
Check 'other adapters: none without a main' (Get-OtherAdapters @($all[0]) $null '10.10.20.42').Count 0

$locs = Get-IpLocations (New-Conn (New-Table @('IPLocation','StartIP','EndIP') @(@('Willisau Lager','172.21.108.1','172.21.108.254'), @('', '1.1.1.1', '1.1.1.2'))))
Check 'ip locations read' $locs.Count 1
Check 'ip location name' $locs[0].name 'Willisau Lager'

# Every antivirus product of a device is kept (Windows Defender next to another one), each once.
$saveCols = $script:Cols
$script:Cols = @{ tblAntivirus = @{ displayname = 'DisplayName' } }
$av = New-Table @('AssetID','DisplayName','onAccessScanningEnabled','productUpToDate') @(
  @('7', 'Windows Defender', 'True', 'True'), @('7', 'Cortex XDR', '1', '1'), @('7', 'Cortex XDR', '1', '1'), @('8', 'Sophos', 'False', 'True'))
$h = Get-HealthByAsset (New-Conn $av)
Check 'antivirus: both products' $h['7']['av'] 'Windows Defender, scanning on, up to date; Cortex XDR, scanning on, up to date'
Check 'antivirus: one product' $h['8']['av'] 'Sophos, scanning OFF, up to date'

# Disks: a CD/DVD drive is listed as optical, a drive without a size by its letter only.
$script:Cols = @{ tblVolume = @{ driveletter = 'DriveLetter'; drivetype = 'DriveType' } }
$vol = New-Table @('AssetID','DriveLetter','Capacity','FreeSpace','DriveType') @(
  @('7', 'C:', '254721126400', '56908316672', '3'), @('7', 'D:', '', '', '5'), @('7', 'E:', '', '', '2'))
$h = Get-HealthByAsset (New-Conn $vol)
Check 'disks: optical and no size' ($h['7']['disk'] -replace '[0-9][^/;]*/[^;]* GB', 'n/n GB') 'C: n/n GB; D: optical; E:'
$script:Cols = $saveCols

# What the push leaves out is counted in Lansweeper and said in the log.
$Config = @{ MaxAgeDays = 0 }
$script:Cols['tblAssetCustom'] = @{ state = 'State'; assetid = 'AssetID' }; $script:Cols['tblAssets'] = @{ lastseen = 'Lastseen' }
$left = Get-LeftOut (New-Conn (New-Table @('total','inactive','old') @(,@('120', '15', '0')))) 100
Check 'left out: inactive' $left.inactive 15
Check 'left out: no name' $left.noName 5
Check 'left out: log line' (Format-LeftOut $left) 'Lansweeper has 120 asset(s); left out: 15 not active in Lansweeper (state other than Active), 5 without a name'
Check 'left out: none' (Format-LeftOut ([ordered]@{ total = 3; inactive = 0; old = 0; noName = 0 })) 'Lansweeper has 3 asset(s); all are sent'

# The upload: IP locations go with the first batch only.
$Config = @{ NobsUrl = 'https://nobs.example.ch'; BatchSize = 2 }
$script:IpLocations = $locs
$script:Sent = @()
function Set-NobsCertificatePin {}
function Invoke-RestMethod { param($Uri, $Method, $Body, $ContentType, $Headers, $TimeoutSec) $script:Sent += [System.Text.Encoding]::UTF8.GetString($Body); return @{ counts = @{ created = 1 } } }
$recs = @(@{ name = 'A'; ref = '1' }, @{ name = 'B'; ref = '2' }, @{ name = 'C'; ref = '3' })
$tot = Send-Records $recs 'tok'
Check 'batches sent' $script:Sent.Count 2
Check 'first batch has ip locations' (($script:Sent[0] | ConvertFrom-Json).ipLocations.Count) 1
Check 'second batch has none' ($null -eq ($script:Sent[1] | ConvertFrom-Json).ipLocations) 'True'
Check 'totals' $tot.created 2
# Setup: the address as typed becomes the one NOBS needs; the settings file keeps its other lines.
Check 'url host only' (Get-NobsUrlText 'inventory.example.ch') 'https://inventory.example.ch'
Check 'url trailing slash and api' (Get-NobsUrlText 'https://inventory.example.ch/api/') 'https://inventory.example.ch'
Check 'url http kept' (Get-NobsUrlText ' http://10.0.0.5:8080 ') 'http://10.0.0.5:8080'
$bad = try { Get-NobsUrlText 'not an address' ; 'accepted' } catch { 'refused' }
Check 'url with a space refused' $bad 'refused'
$cfgFile = Join-Path ([IO.Path]::GetTempPath()) ("nobs-cfg-" + [guid]::NewGuid() + '.ps1')
Set-Content -LiteralPath $cfgFile -Value @('$Config.MaxAgeDays = 30', "`$Config.NobsUrl = 'https://old.example.ch'")
Save-LocalConfig $cfgFile @{ NobsUrl = 'https://inventory.example.ch'; NobsCertThumbprint = 'AB12'; SqlFromLansweeper = $true }
$lines = Get-Content -LiteralPath $cfgFile
Check 'config keeps other lines' ($lines -contains '$Config.MaxAgeDays = 30') 'True'
Check 'config has the new address once' (@($lines | Where-Object { $_ -match 'NobsUrl' }).Count) 1
Check 'config address' ($lines -contains "`$Config.NobsUrl = 'https://inventory.example.ch'") 'True'
Check 'config thumbprint' ($lines -contains "`$Config.NobsCertThumbprint = 'AB12'") 'True'
Check 'config switch' ($lines -contains '$Config.SqlFromLansweeper = $true') 'True'
Save-LocalConfig $cfgFile @{ NobsUrl = 'https://other.example.ch'; NobsCertThumbprint = '' }
$lines = Get-Content -LiteralPath $cfgFile
Check 'config replaced, empty left out' ((@($lines | Where-Object { $_ -match 'NobsUrl|NobsCertThumbprint' }) -join '|')) "`$Config.NobsUrl = 'https://other.example.ch'"
Check 'config keeps the switch' ($lines -contains '$Config.SqlFromLansweeper = $true') 'True'
Remove-Item -LiteralPath $cfgFile

# The token is checked with an empty push: accepted, wrong (401), or the push turned off (403).
function Set-NobsCertificatePin { }
$script:Answer = 0
function Get-HttpStatus($err) { return $script:Answer }
function Invoke-RestMethod { param($Uri, $Method, $Body, $ContentType, $Headers, $TimeoutSec) $script:Asked = $Uri; if ($script:Answer) { throw "HTTP $script:Answer" }; return @{ counts = @{} } }
$Config.NobsUrl = 'https://inventory.example.ch'
Check 'token accepted' (Test-NobsToken 'good') ''
Check 'token check uses the push' $script:Asked 'https://inventory.example.ch/api/feed/push'
$script:Answer = 401; Check 'token wrong' ((Test-NobsToken 'bad') -match 'token is wrong') 'True'
$script:Answer = 403; Check 'push turned off' ((Test-NobsToken 'x') -match 'script push') 'True'

if ($fails) { Write-Host "$fails failed"; exit 1 } else { Write-Host 'all passed' }
