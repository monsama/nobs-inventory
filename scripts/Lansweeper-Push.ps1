<#
.SYNOPSIS
    Pushes the assets of a Lansweeper Classic server to NOBS Inventory. Run it on the Lansweeper server.

.DESCRIPTION
    Reads the active assets from the Lansweeper database (SQL LocalDB or SQL Server) and sends them to
    NOBS Inventory at POST /api/feed/push. NOBS matches them by serial number, then by name, and merges
    the fields its policy allows (IP, MAC, OS, model). Nothing is deleted, and what you set by hand stays.

    Columns that a Lansweeper version does not have are skipped (and logged). Required ones stop the run.

    Links are sent too: each device to the switch port it is connected to (from the Lansweeper switch report),
    and each monitor to the PC it is attached to (from the monitor scan). The installed software of each device is sent as well.

    The token is the one the NOBS administrator set on the server (NI_FEED_TOKEN). It is stored on this
    machine with -SetCredential, protected by Windows (DPAPI): only this user on this machine can read it.

    Runs with the built-in Windows PowerShell 5.1 (also PowerShell 7).

.EXAMPLE
    .\Lansweeper-Push.ps1 -SetCredential                 # store the NOBS feed token (DPAPI)
    .\Lansweeper-Push.ps1 -SetSqlCredential              # store a SQL login for the Lansweeper database (DPAPI)
    .\Lansweeper-Push.ps1 -DryRun                        # read Lansweeper, show the first records, send nothing
    .\Lansweeper-Push.ps1                                # normal push
    .\Lansweeper-Push.ps1 -RegisterTask                  # daily scheduled task
    .\Lansweeper-Push.ps1 -FindTables                   # list the tables and columns that may hold links (port, switch, monitor)
    .\Lansweeper-Push.ps1 -ShowCertificate              # show the thumbprint of the NOBS certificate, for NobsCertThumbprint
#>
[CmdletBinding()]
param(
    [switch]$DryRun,
    [switch]$SetCredential,
    [switch]$SetSqlCredential,
    [switch]$RegisterTask,
    [switch]$FindTables,
    [switch]$ShowCertificate,
    [string]$TaskTime = '06:30'
)

# ============================================================
# CONFIGURATION - adjust here, or in Lansweeper-Push.config.ps1 next to this script
# ============================================================
$Config = @{
    # Lansweeper database. LocalDB: run this script as the Windows user that installed Lansweeper.
    # Full SQL Server: e.g. 'Server=LSSERVER\SQLEXPRESS;Database=lansweeperdb;Integrated Security=True'
    SqlConnectionString = 'Server=(localdb)\.\LSInstance;Database=lansweeperdb;Integrated Security=True;Connect Timeout=30'
    SqlUseStoredCredential = $false     # $true = SQL login stored with -SetSqlCredential (for a Windows account without database rights)

    # NOBS Inventory address, without /api. Use the same address the browser uses.
    NobsUrl             = 'https://inventory.argolite.ch'
    # Thumbprint of the NOBS certificate, when Windows does not trust it (e.g. Caddy's internal CA).
    # Get it with: .\LansweeperNobs.ps1 -ShowCertificate. Leave empty when the certificate is trusted.
    NobsCertThumbprint  = ''

    MaxAgeDays          = 90      # only assets Lansweeper has seen in the last N days (0 = all)
    BatchSize           = 500     # assets per request
    DataDir             = (Join-Path $env:ProgramData 'LansweeperNobsPush')   # credential and log
}
# ============================================================

$ErrorActionPreference = 'Stop'
$script:LocalConfig = Join-Path $PSScriptRoot 'Lansweeper-Push.config.ps1'
if (Test-Path -LiteralPath $script:LocalConfig) { . $script:LocalConfig }

# The columns the push reads. Required ones must exist; the others are left out when a version does not have them.
$script:Wanted = [ordered]@{
    tblAssets      = @('AssetID', 'AssetName', 'Username', 'Userdomain', 'IPAddress', 'Mac', 'Assettype', 'Lastseen', 'OScode')
    tblAssetCustom = @('AssetID', 'Manufacturer', 'Model', 'Serialnumber', 'State', 'Location', 'Building')
    tsysAssetTypes = @('AssetType', 'AssetTypename')
    tsysOS         = @('OScode', 'OSname')
    tblNetwork     = @('AssetID', 'DNSHostname')
    web50repSwitchports = @('AssetID', 'If', 'Portname', 'deviceassetid')
    tblMonitor     = @('AssetID', 'MonitorModel', 'SerialNumber', 'MonitorManufacturer')
    tblSoftware    = @('AssetID', 'softID', 'softwareVersion')
    tblSoftwareUni = @('SoftID', 'softwareName')
}
$script:Required = @{
    tblAssets      = @('AssetID', 'AssetName', 'Assettype')
    tblAssetCustom = @('AssetID')
    tsysAssetTypes = @('AssetType', 'AssetTypename')
}
$script:Cols = @{}   # table -> lower-case column name -> real column name, for the columns that exist

function Write-PushLog([string]$Message, [string]$Level = 'INFO') {
    $line = '{0} [{1}] {2}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Level, $Message
    if ($Level -eq 'ERROR') { Write-Host $line -ForegroundColor Red } else { Write-Host $line }
    if (-not (Test-Path $Config.DataDir)) { New-Item -ItemType Directory -Path $Config.DataDir -Force | Out-Null }
    Add-Content -Path (Join-Path $Config.DataDir 'push.log') -Value $line -Encoding UTF8
}

function Get-StoredToken {
    $path = Join-Path $Config.DataDir 'cred-nobs.xml'
    if (-not (Test-Path $path)) { throw "No NOBS token stored - run: .\Lansweeper-Push.ps1 -SetCredential (as the account that runs the push)" }
    return (Import-Clixml $path).GetNetworkCredential().Password
}

function Get-StoredSqlCredential {
    $path = Join-Path $Config.DataDir 'cred-sql.xml'
    if (-not (Test-Path $path)) { throw "No SQL login stored - run: .\Lansweeper-Push.ps1 -SetSqlCredential (as the account that runs the push)" }
    return (Import-Clixml $path)
}

function ConvertTo-Text($v) {
    if ($null -eq $v -or $v -is [System.DBNull]) { return '' }
    return ([string]$v).Replace([string][char]0, '').Trim()
}

function ConvertTo-FirstIPv4($v) {
    foreach ($part in ((ConvertTo-Text $v) -split '[,;\s]+')) {
        if ($part -match '^\d{1,3}(\.\d{1,3}){3}$' -and $part -ne '0.0.0.0') { return $part }
    }
    return ''
}

# Lansweeper's own placeholders for "no value", which must not be sent as data
function Test-Junk([string]$s) {
    return ($s -eq '' -or $s -match '^(null|none|n/a|unknown|-|0+|f+|to be filled by o\.e\.m\.|default string|system serial number)$')
}
function Get-Clean($v) { $s = ConvertTo-Text $v; if (Test-Junk $s.ToLowerInvariant()) { return '' } return $s }

function Test-Col([string]$Table, [string]$Col) {
    return ($script:Cols.ContainsKey($Table) -and $script:Cols[$Table].ContainsKey($Col.ToLowerInvariant()))
}

# Reads which tables and columns exist. Stops when a required one is missing.
function Initialize-Schema($conn) {
    $problems = New-Object System.Collections.Generic.List[string]
    $missing = New-Object System.Collections.Generic.List[string]
    foreach ($table in $script:Wanted.Keys) {
        $cmd = $conn.CreateCommand()
        $cmd.CommandText = 'SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = @t'
        [void]$cmd.Parameters.AddWithValue('@t', $table)
        $existing = @{}
        $reader = $cmd.ExecuteReader()
        try { while ($reader.Read()) { $existing[([string]$reader[0]).ToLowerInvariant()] = [string]$reader[0] } }
        finally { $reader.Close() }
        $script:Cols[$table] = $existing
        if ($existing.Count -eq 0) {
            if ($script:Required.ContainsKey($table)) { $problems.Add("table $table") } else { $missing.Add("table $table") }
            continue
        }
        foreach ($c in $script:Wanted[$table]) {
            if (-not $existing.ContainsKey($c.ToLowerInvariant())) {
                if ($script:Required.ContainsKey($table) -and $script:Required[$table] -contains $c) { $problems.Add("$table.$c") }
                else { $missing.Add("$table.$c") }
            }
        }
    }
    return @{ Problems = $problems; Missing = $missing }
}

# One select item. A column that does not exist is selected as NULL, so the reader always has the same names.
function Get-SelectItem([string]$Table, [string]$Alias, [string]$Col) {
    $out = "${Alias}__$Col"
    if (Test-Col $Table $Col) { return "$Alias.[$($script:Cols[$Table][$Col.ToLowerInvariant()])] AS [$out]" }
    return "CAST(NULL AS nvarchar(200)) AS [$out]"
}

function Open-LsConnection {
    $csb = New-Object System.Data.SqlClient.SqlConnectionStringBuilder $Config.SqlConnectionString
    if ($Config.SqlUseStoredCredential) {
        $cred = Get-StoredSqlCredential
        $csb['Integrated Security'] = $false
        $csb['User ID'] = $cred.UserName
        $csb['Password'] = $cred.GetNetworkCredential().Password
    }
    $conn = New-Object System.Data.SqlClient.SqlConnection $csb.ConnectionString
    $conn.Open()
    return $conn
}

function Find-LsTables {
    $conn = Open-LsConnection
    try {
        $cmd = $conn.CreateCommand()
        $cmd.CommandText = "SELECT TABLE_NAME, COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME LIKE '%port%' OR TABLE_NAME LIKE '%switch%' OR TABLE_NAME LIKE '%connect%' OR TABLE_NAME LIKE '%network%' OR TABLE_NAME LIKE '%monitor%' OR TABLE_NAME LIKE '%soft%' OR TABLE_NAME LIKE '%install%' ORDER BY TABLE_NAME, ORDINAL_POSITION"
        $reader = $cmd.ExecuteReader()
        $lines = New-Object System.Collections.Generic.List[string]
        try { while ($reader.Read()) { $lines.Add("$($reader[0]).$($reader[1])") } } finally { $reader.Close() }
        return , $lines.ToArray()
    } finally { $conn.Dispose() }
}

# Which device is connected to which switch port, from the Lansweeper switch report. Keyed by the device's AssetID.
function Get-SwitchLinks($conn) {
    $map = @{}
    if (-not (Test-Col 'web50repSwitchports' 'deviceassetid')) { Write-PushLog 'The switch port table is not in this Lansweeper version - no switch links' 'WARN'; return $map }
    $cmd = $conn.CreateCommand()
    $cmd.CommandText = 'SELECT [AssetID], [If], [Portname], [deviceassetid] FROM [web50repSwitchports] WHERE [deviceassetid] IS NOT NULL'
    $cmd.CommandTimeout = 300
    $reader = $cmd.ExecuteReader()
    try {
        while ($reader.Read()) {
            $switch = ConvertTo-Text $reader['AssetID']
            $device = ConvertTo-Text $reader['deviceassetid']
            if (-not $switch -or -not $device) { continue }
            $port = Get-Clean $reader['Portname']
            if (-not $port) { $port = Get-Clean $reader['If'] }
            if (-not $map.ContainsKey($device)) { $map[$device] = New-Object System.Collections.Generic.List[object] }
            $map[$device].Add([ordered]@{ ref = $switch; kind = 'connected'; port = $port })
        }
    } finally { $reader.Close() }
    return $map
}

# Installed software per asset, from the Lansweeper software tables. Null when those tables are not there.
function Get-SoftwareByAsset($conn) {
    if (-not ((Test-Col 'tblSoftware' 'AssetID') -and (Test-Col 'tblSoftware' 'softID') -and (Test-Col 'tblSoftwareUni' 'SoftID') -and (Test-Col 'tblSoftwareUni' 'softwareName'))) {
        Write-PushLog 'The software tables are not in this Lansweeper version - no software is sent' 'WARN'
        return $null
    }
    $map = @{}
    $cmd = $conn.CreateCommand()
    $cmd.CommandText = 'SELECT s.[AssetID], u.[softwareName], s.[softwareVersion] FROM [tblSoftware] s JOIN [tblSoftwareUni] u ON u.[SoftID] = s.[softID] WHERE u.[softwareName] IS NOT NULL'
    $cmd.CommandTimeout = 300
    $reader = $cmd.ExecuteReader()
    try {
        while ($reader.Read()) {
            $asset = ConvertTo-Text $reader['AssetID']
            $name = Get-Clean $reader['softwareName']
            if (-not $asset -or -not $name) { continue }
            if (-not $map.ContainsKey($asset)) { $map[$asset] = New-Object System.Collections.Generic.List[object] }
            $map[$asset].Add([ordered]@{ name = $name; version = Get-Clean $reader['softwareVersion'] })
        }
    } finally { $reader.Close() }
    return $map
}

# Monitors with a serial number, each linked to the PC it is attached to.
function Get-MonitorRecords($conn) {
    $list = New-Object System.Collections.Generic.List[object]
    if (-not ((Test-Col 'tblMonitor' 'AssetID') -and (Test-Col 'tblMonitor' 'SerialNumber'))) { return , @() }
    $cmd = $conn.CreateCommand()
    $cmd.CommandText = 'SELECT [AssetID], [MonitorModel], [SerialNumber], [MonitorManufacturer] FROM [tblMonitor] WHERE [SerialNumber] IS NOT NULL'
    $cmd.CommandTimeout = 300
    $reader = $cmd.ExecuteReader()
    try {
        while ($reader.Read()) {
            $serial = Get-Clean $reader['SerialNumber']
            $pc = ConvertTo-Text $reader['AssetID']
            if (-not $serial -or -not $pc) { continue }
            $model = Get-Clean $reader['MonitorModel']
            $maker = Get-Clean $reader['MonitorManufacturer']
            $list.Add([ordered]@{
                name = (@($model, $serial) | Where-Object { $_ }) -join ' '
                serial = $serial; ref = "mon-$serial"; assetType = 'Monitor'
                model = (@($maker, $model) | Where-Object { $_ }) -join ' '
                links = @([ordered]@{ ref = $pc; kind = 'attached'; port = '' })
            })
        }
    } finally { $reader.Close() }
    return , $list.ToArray()
}

function Get-LsRecords {
    $conn = Open-LsConnection
    try {
        $schema = Initialize-Schema $conn
        if ($schema.Problems.Count) {
            foreach ($p in $schema.Problems) { Write-PushLog "Required column or table missing: $p" 'ERROR' }
            throw 'Lansweeper database does not have the columns this push needs.'
        }
        if ($schema.Missing.Count) { Write-PushLog ("Not in this Lansweeper version, skipped: " + ($schema.Missing -join ', ')) 'WARN' }

        $select = @(
            (Get-SelectItem 'tblAssets' 'a' 'AssetID'), (Get-SelectItem 'tblAssets' 'a' 'AssetName'),
            (Get-SelectItem 'tblAssets' 'a' 'Username'), (Get-SelectItem 'tblAssets' 'a' 'Userdomain'),
            (Get-SelectItem 'tblAssets' 'a' 'IPAddress'), (Get-SelectItem 'tblAssets' 'a' 'Mac'), (Get-SelectItem 'tblAssets' 'a' 'Lastseen'),
            (Get-SelectItem 'tblAssetCustom' 'c' 'Manufacturer'), (Get-SelectItem 'tblAssetCustom' 'c' 'Model'),
            (Get-SelectItem 'tblAssetCustom' 'c' 'Serialnumber'), (Get-SelectItem 'tblAssetCustom' 'c' 'Location'),
            (Get-SelectItem 'tblAssetCustom' 'c' 'Building'),
            (Get-SelectItem 'tsysAssetTypes' 'ty' 'AssetTypename'), (Get-SelectItem 'tsysOS' 'os' 'OSname'),
            (Get-SelectItem 'tblNetwork' 'n' 'DNSHostname')
        ) -join ', '

        $joins = ''
        if (Test-Col 'tblAssetCustom' 'AssetID') { $joins += 'LEFT JOIN [tblAssetCustom] c ON c.[AssetID] = a.[AssetID] ' }
        if ((Test-Col 'tblNetwork' 'AssetID') -and (Test-Col 'tblNetwork' 'DNSHostname')) {
            $joins += 'LEFT JOIN (SELECT [AssetID], MAX([DNSHostname]) AS [DNSHostname] FROM [tblNetwork] GROUP BY [AssetID]) n ON n.[AssetID] = a.[AssetID] '
        }
        $joins += 'LEFT JOIN [tsysAssetTypes] ty ON ty.[AssetType] = a.[Assettype] '
        if ((Test-Col 'tsysOS' 'OScode') -and (Test-Col 'tblAssets' 'OScode')) { $joins += 'LEFT JOIN [tsysOS] os ON os.[OScode] = a.[OScode] ' }

        $where = @('1=1')
        if (Test-Col 'tblAssetCustom' 'State') { $where += 'c.[State] = 1' }
        if ($Config.MaxAgeDays -gt 0) {
            if (Test-Col 'tblAssets' 'Lastseen') { $where += 'a.[Lastseen] >= @since' }
            else { Write-PushLog 'No Lastseen column - the age filter is not applied' 'WARN' }
        }

        $cmd = $conn.CreateCommand()
        $cmd.CommandText = "SELECT $select FROM [tblAssets] a $joins WHERE $($where -join ' AND ') ORDER BY a.[AssetName]"
        $cmd.CommandTimeout = 300
        if ($Config.MaxAgeDays -gt 0 -and (Test-Col 'tblAssets' 'Lastseen')) { [void]$cmd.Parameters.AddWithValue('@since', (Get-Date).AddDays(-$Config.MaxAgeDays)) }
        $reader = $cmd.ExecuteReader()
        $list = New-Object System.Collections.Generic.List[object]
        try {
            while ($reader.Read()) {
                $name = Get-Clean $reader['a__AssetName']
                # A device scanned without an agent is named by its IP address: use its DNS name when Lansweeper has one.
                $dns = Get-Clean $reader['n__DNSHostname']
                if ($dns -and $name -match '^\d{1,3}(\.\d{1,3}){3}$') { $name = $dns }
                if (-not $name) { continue }
                $mac = (Get-Clean $reader['a__Mac']) -replace '[^0-9a-fA-F]', ''
                $list.Add([ordered]@{
                    name = $name
                    serial = Get-Clean $reader['c__Serialnumber']
                    ip = ConvertTo-FirstIPv4 $reader['a__IPAddress']
                    mac = $(if ($mac.Length -eq 12) { (($mac -split '(..)' | Where-Object { $_ }) -join ':').ToLowerInvariant() } else { '' })
                    os = Get-Clean $reader['os__OSname']
                    model = (@((Get-Clean $reader['c__Manufacturer']), (Get-Clean $reader['c__Model'])) | Where-Object { $_ }) -join ' '
                    location = (@((Get-Clean $reader['c__Building']), (Get-Clean $reader['c__Location'])) | Where-Object { $_ }) -join ' / '
                    assetType = Get-Clean $reader['ty__AssetTypename']
                    ref = ConvertTo-Text $reader['a__AssetID']
                    links = @()
                    software = $null
                })
            }
        } finally { $reader.Close() }
        $links = Get-SwitchLinks $conn
        foreach ($rec in $list) { if ($links.ContainsKey($rec['ref'])) { $rec['links'] = @($links[$rec['ref']]) } }
        $software = Get-SoftwareByAsset $conn
        if ($software) {
            foreach ($rec in $list) { $rec['software'] = $(if ($software.ContainsKey($rec['ref'])) { @($software[$rec['ref']]) } else { @() }) }
        }
        foreach ($m in (Get-MonitorRecords $conn)) { $list.Add($m) }
        return , $list.ToArray()
    } finally { $conn.Dispose() }
}

# Accepts the NOBS certificate when its thumbprint is the pinned one (as the Snipe-IT script does).
# Windows PowerShell 5.1 only: PowerShell 7 ignores this callback.
function Set-NobsCertificatePin {
    [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
    $pin = ($Config.NobsCertThumbprint -replace '[ :]', '').ToUpperInvariant()
    if (-not $pin) { return }
    if (-not ('NobsCertPin' -as [type])) {
        Add-Type -TypeDefinition @"
using System.Net;
using System.Net.Security;
using System.Security.Cryptography.X509Certificates;
public static class NobsCertPin {
    static string pin;
    public static void Install(string thumbprint) {
        pin = thumbprint;
        ServicePointManager.ServerCertificateValidationCallback = Check;
    }
    static bool Check(object sender, X509Certificate cert, X509Chain chain, SslPolicyErrors errors) {
        if (errors == SslPolicyErrors.None) return true;
        return cert != null && string.Equals(cert.GetCertHashString(), pin, System.StringComparison.OrdinalIgnoreCase);
    }
}
"@
    }
    [NobsCertPin]::Install($pin)
}

# Connects to NOBS and prints its certificate's thumbprint, for NobsCertThumbprint.
function Show-NobsCertificate {
    $uri = [Uri]$Config.NobsUrl
    $tcp = New-Object System.Net.Sockets.TcpClient $uri.Host, $uri.Port
    try {
        $ssl = New-Object System.Net.Security.SslStream $tcp.GetStream(), $false, ([System.Net.Security.RemoteCertificateValidationCallback] { param($a, $b, $c, $d) $true })
        try { $ssl.AuthenticateAsClient($uri.Host, $null, [System.Security.Authentication.SslProtocols]::Tls12, $false) }
        catch { throw "TLS handshake with $($uri.Host) failed: $(if ($_.Exception.InnerException) { $_.Exception.InnerException.Message } else { $_.Exception.Message })" }
        $cert = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2 $ssl.RemoteCertificate
        Write-PushLog "Certificate of $($uri.Host): $($cert.Subject)"
        Write-PushLog "Thumbprint: $($cert.Thumbprint)  (valid until $($cert.NotAfter.ToString('yyyy-MM-dd')))"
        Write-PushLog 'Put the thumbprint in NobsCertThumbprint. Caddy renews its certificate, so check it again when pushes start failing.'
    } finally { $tcp.Close() }
}

function Send-Records($records, [string]$Token) {
    Set-NobsCertificatePin
    $totals = @{ created = 0; updated = 0; linked = 0; unchanged = 0; ambiguous = 0; excluded = 0 }
    $url = $Config.NobsUrl.TrimEnd('/') + '/api/feed/push'
    for ($i = 0; $i -lt $records.Count; $i += $Config.BatchSize) {
        $last = [math]::Min($i + $Config.BatchSize - 1, $records.Count - 1)
        $batch = @($records[$i..$last])
        $body = (@{ records = $batch } | ConvertTo-Json -Depth 4 -Compress)
        $res = Invoke-RestMethod -Uri $url -Method Post -Body ([System.Text.Encoding]::UTF8.GetBytes($body)) `
            -ContentType 'application/json; charset=utf-8' -Headers @{ Authorization = "Bearer $Token" } -TimeoutSec 300
        foreach ($k in @($totals.Keys)) { if ($res.counts.$k) { $totals[$k] += [int]$res.counts.$k } }
    }
    return $totals
}

function Register-PushTask {
    $cred = Get-Credential -Message 'Account that runs the push (for LocalDB: the user that installed Lansweeper)'
    $action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$PSCommandPath`""
    $trigger = New-ScheduledTaskTrigger -Daily -At $TaskTime
    $settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Hours 2) -StartWhenAvailable -MultipleInstances IgnoreNew
    Register-ScheduledTask -TaskName 'Lansweeper NOBS Push' -Action $action -Trigger $trigger -Settings $settings `
        -User $cred.UserName -Password $cred.GetNetworkCredential().Password -Description 'Push Lansweeper assets to NOBS Inventory' -Force | Out-Null
    Write-PushLog "Scheduled task 'Lansweeper NOBS Push' registered: daily at $TaskTime as $($cred.UserName)"
    Write-PushLog 'The NOBS token (-SetCredential) must be stored as that same user.'
}

try {
    if ($SetCredential) {
        if (-not (Test-Path $Config.DataDir)) { New-Item -ItemType Directory -Path $Config.DataDir -Force | Out-Null }
        $tok = Read-Host -AsSecureString 'NOBS feed token (set on the server as NI_FEED_TOKEN)'
        (New-Object System.Management.Automation.PSCredential('nobs-feed', $tok)) | Export-Clixml -Path (Join-Path $Config.DataDir 'cred-nobs.xml')
        Write-PushLog "NOBS token stored for $env:USERNAME on $env:COMPUTERNAME"
        exit 0
    }
    if ($SetSqlCredential) {
        if (-not (Test-Path $Config.DataDir)) { New-Item -ItemType Directory -Path $Config.DataDir -Force | Out-Null }
        Get-Credential -Message 'SQL login for the Lansweeper database (e.g. lansweeperuser)' | Export-Clixml -Path (Join-Path $Config.DataDir 'cred-sql.xml')
        Write-PushLog "SQL login stored for $env:USERNAME on $env:COMPUTERNAME. Set SqlUseStoredCredential = `$true in the config to use it."
        exit 0
    }
    if ($RegisterTask) { Register-PushTask; exit 0 }
    if ($ShowCertificate) { Show-NobsCertificate; exit 0 }
    if ($FindTables) {
        $lines = Find-LsTables
        $file = Join-Path $Config.DataDir 'tables.txt'
        $lines | Set-Content -Path $file -Encoding UTF8
        $lines | ForEach-Object { Write-Host $_ }
        Write-PushLog "Found $($lines.Count) column(s). Saved to $file"
        exit 0
    }

    Write-PushLog 'Reading Lansweeper ...'
    $records = Get-LsRecords
    Write-PushLog "$($records.Count) active asset(s) with a name"

    if ($DryRun) {
        $records | Select-Object -First 3 | ForEach-Object { Write-PushLog ("  " + (($_.GetEnumerator() | ForEach-Object { "$($_.Key)=$($_.Value)" }) -join ' ')) }
        Write-PushLog 'Dry run: nothing was sent.'
        exit 0
    }

    $token = Get-StoredToken
    $totals = Send-Records $records $token
    Write-PushLog ("NOBS: {0} created, {1} updated, {2} linked, {3} unchanged, {4} ambiguous name(s) skipped, {5} excluded" -f `
        $totals.created, $totals.updated, $totals.linked, $totals.unchanged, $totals.ambiguous, $totals.excluded)
    exit 0
} catch {
    Write-PushLog "Failed: $($_.Exception.Message)" 'ERROR'
    exit 1
}
