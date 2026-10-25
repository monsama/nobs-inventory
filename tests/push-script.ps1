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
Check 'first v4' (Get-FirstV4 'fe80::1, 10.1.1.5') '10.1.1.5'
Check 'first v4 none' (Get-FirstV4 '0.0.0.0') ''

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
$locs = Get-IpLocations (New-Conn (New-Table @('IPLocation','StartIP','EndIP') @(@('Bern Lager','172.21.108.1','172.21.108.254'), @('', '1.1.1.1', '1.1.1.2'))))
Check 'ip locations read' $locs.Count 1
Check 'ip location name' $locs[0].name 'Bern Lager'

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
if ($fails) { Write-Host "$fails failed"; exit 1 } else { Write-Host 'all passed' }
