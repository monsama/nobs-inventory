<#
.SYNOPSIS
    Pushes the assets of a Lansweeper Classic server to NOBS Inventory. Run it on the Lansweeper server.

.DESCRIPTION
    Reads the active assets from the Lansweeper database (SQL LocalDB or SQL Server) and sends them to
    NOBS Inventory at POST /api/feed/push. NOBS matches them by serial number, then by name, and merges
    the fields its policy allows (Settings -> Feed: addresses, OS, model, hardware, user and more). Nothing is deleted, and what you set by hand stays.

    Columns that a Lansweeper version does not have are skipped (and logged). Required ones stop the run.

    Monitors are linked to the PC they are attached to (from the monitor scan). The installed software of each device is
    sent as well, and its firmware, last power event, disks and antivirus state. Switch ports and hosts are not read: the
    inventory keeps those connections by hand.

    The first run asks for the NOBS address and the feed token (Settings -> Feed -> Create token), checks both
    against the server, and keeps them: the address in Lansweeper-Push.config.ps1 next to this script, the token
    protected by Windows (DPAPI), so only this user on this machine can read it. -Setup asks again.

    Runs with the built-in Windows PowerShell 5.1 (also PowerShell 7).

.EXAMPLE
    .\Lansweeper-Push.ps1                                # first run: asks for the address and the token, then pushes
    .\Lansweeper-Push.ps1 -Setup                         # ask for the address and the token again
    .\Lansweeper-Push.ps1 -SetCredential                 # store a new NOBS feed token only (DPAPI)
    .\Lansweeper-Push.ps1 -SetSqlCredential              # store a SQL login for the Lansweeper database (DPAPI)
    .\Lansweeper-Push.ps1 -ShowLansweeperDb              # show the database login Lansweeper uses (server, database, user; no password)
    .\Lansweeper-Push.ps1 -DryRun                        # read Lansweeper, show the first records, send nothing
    .\Lansweeper-Push.ps1                                # normal push
    .\Lansweeper-Push.ps1 -RegisterTask                  # daily scheduled task
    .\Lansweeper-Push.ps1 -FindTables                   # list the tables and columns that may hold links (port, switch, monitor)
    .\Lansweeper-Push.ps1 -ShowCertificate              # show the thumbprint of the NOBS certificate, for NobsCertThumbprint
#>
[CmdletBinding()]
param(
    [switch]$DryRun,
    [switch]$Setup,
    [switch]$SetCredential,
    [switch]$SetSqlCredential,
    [switch]$RegisterTask,
    [switch]$FindTables,
    [switch]$ShowCertificate,
    [switch]$ShowLansweeperDb,
    [string]$TaskTime = '06:30'
)

# ============================================================
# CONFIGURATION - adjust here, or in Lansweeper-Push.config.ps1 next to this script
# ============================================================
$Config = @{
    # Lansweeper database. LocalDB: run this script as the Windows user that installed Lansweeper.
    # Full SQL Server: e.g. 'Server=LSSERVER\SQLEXPRESS;Database=lansweeperdb;Integrated Security=True'
    SqlConnectionString = 'Server=(localdb)\.\LSInstance;Database=lansweeperdb;Integrated Security=True;Connect Timeout=30'
    SqlUseStoredCredential = $true      # $true = SQL login stored with -SetSqlCredential (for a Windows account without database rights)
    SqlFromLansweeper   = $false        # $true = the database login Lansweeper itself uses, read from its configuration at each run
                                        #         (run as administrator, Windows PowerShell 5.1). Nothing is stored.

    # NOBS Inventory address, without /api. Use the same address the browser uses.
    NobsUrl             = 'https://inventory.example.com'   # replaced by the address the script was downloaded from
    # Thumbprint of the NOBS certificate, used only when Windows does not trust it (e.g. a self-signed one).
    # Filled in when the script is downloaded from NOBS (Settings -> Feed -> Download script); the setup offers it too.
    NobsCertThumbprint  = ''

    MaxAgeDays          = 0       # 0 = all active assets; NOBS flags those not scanned for 3 months. N = only those seen in the last N days
    BatchSize           = 500     # assets per request
    DataDir             = (Join-Path $env:ProgramData 'LansweeperNobsPush')   # credential and log
}
# ============================================================

$ErrorActionPreference = 'Stop'
$script:LocalConfig = Join-Path $PSScriptRoot 'Lansweeper-Push.config.ps1'
if (Test-Path -LiteralPath $script:LocalConfig) { . $script:LocalConfig }

# The columns the push reads. Required ones must exist; the others are left out when a version does not have them.
$script:Wanted = [ordered]@{
    tblAssets      = @('AssetID', 'AssetName', 'Username', 'Userdomain', 'IPAddress', 'Mac', 'Assettype', 'Lastseen', 'OScode', 'Memory', 'Processor')
    tblAssetCustom = @('AssetID', 'Manufacturer', 'Model', 'Serialnumber', 'State', 'Location', 'Building', 'PurchaseDate', 'Warrantydate')
    tsysAssetTypes = @('AssetType', 'AssetTypename')
    tsysOS         = @('OScode', 'OSname')
    # The full name of a Windows (Microsoft Windows 10 Pro) and its version; tsysOS only has a short one (Win 10).
    tblOperatingsystem = @('AssetID', 'Caption', 'Version')
    tblNetwork     = @('AssetID', 'DNSHostname', 'DNSDomain', 'IPAddress', 'IPSubnet', 'DefaultIPGateway', 'DNSServerSearchOrder', 'DHCPEnabled', 'IPEnabled', 'MACAddress', 'Caption', 'Description')
    tblComputersystem = @('AssetID', 'Domainrole')
    tblSystemEnclosure = @('AssetID', 'ChassisTypes')
    tblADusers     = @('Username', 'Userdomain', 'Department', 'Displayname')
    tsysIPLocations = @('IPLocation', 'StartIP', 'EndIP')
    tblMonitor     = @('AssetID', 'MonitorModel', 'SerialNumber', 'MonitorManufacturer')
    tblSoftware    = @('AssetID', 'softID', 'softwareVersion')
    tblSoftwareUni = @('SoftID', 'softwareName')
    tblBIOS        = @('AssetID', 'Version')
    tblUptime      = @('AssetId', 'EventTime')
    tblVolume      = @('AssetID', 'DriveLetter', 'Capacity', 'FreeSpace', 'DriveType')
    tblQuickFixEngineering = @('AssetID', 'QFEID', 'InstalledOn')
    tblAntivirus   = @('AssetID', 'DisplayName', 'onAccessScanningEnabled', 'productUpToDate')
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

# The address as NOBS needs it: https:// when no scheme is given, without a trailing / or /api.
function Get-NobsUrlText([string]$Text) {
    $u = "$Text".Trim().TrimEnd('/')
    if (-not $u) { return '' }
    if ($u -notmatch '^[a-z]+://') { $u = 'https://' + $u }
    $u = $u -replace '/api$', ''
    if ($u -notmatch '^https?://[^/\s]+(/[^\s]*)?$') { throw "'$Text' is not an address such as https://inventory.example.ch" }
    return $u.TrimEnd('/')
}

# Writes settings into Lansweeper-Push.config.ps1 as $Config.Name = value lines, replacing those it sets and keeping the rest.
# An empty text is left out.
function Save-LocalConfig([string]$Path, [hashtable]$Values) {
    $names = ($Values.Keys | ForEach-Object { [regex]::Escape($_) }) -join '|'
    $keep = @()
    if (Test-Path -LiteralPath $Path) { $keep = @(Get-Content -LiteralPath $Path | Where-Object { $_ -notmatch "^\s*\`$Config\.($names)\s*=" }) }
    $lines = @($keep)
    foreach ($k in ($Values.Keys | Sort-Object)) {
        $v = $Values[$k]
        if ($v -is [bool]) { $lines += "`$Config.$k = `$$($v.ToString().ToLowerInvariant())" }
        elseif ("$v") { $lines += "`$Config.$k = '$("$v" -replace "'", "''")'" }
    }
    Set-Content -LiteralPath $Path -Value $lines -Encoding UTF8
}

function Save-Token([System.Security.SecureString]$Token) {
    if (-not (Test-Path $Config.DataDir)) { New-Item -ItemType Directory -Path $Config.DataDir -Force | Out-Null }
    (New-Object System.Management.Automation.PSCredential('nobs-feed', $Token)) | Export-Clixml -Path (Join-Path $Config.DataDir 'cred-nobs.xml')
}

# The HTTP status of a failed request (0 when the server did not answer).
function Get-HttpStatus($err) { if ($err.Exception.Response) { return [int]$err.Exception.Response.StatusCode } else { return 0 } }

# Sends an empty push: the server checks the token and changes nothing. Returns '' when the token is right, else why not.
function Test-NobsToken([string]$Token) {
    Set-NobsCertificatePin
    try {
        Invoke-RestMethod -Uri ($Config.NobsUrl.TrimEnd('/') + '/api/feed/push') -Method Post -Body '{"records":[]}' `
            -ContentType 'application/json' -Headers @{ Authorization = "Bearer $Token" } -TimeoutSec 30 | Out-Null
        return ''
    } catch {
        $code = Get-HttpStatus $_
        if ($code -eq 401) { return 'The token is wrong. Create a new one in NOBS: Settings -> Feed -> Create token.' }
        if ($code -eq 429) { return 'Too many wrong tokens from this address. Wait 15 minutes.' }
        if ($code -eq 403) { return 'NOBS takes no push now: in Settings -> Feed, turn Lansweeper on and choose the script push.' }
        return "NOBS did not answer: $($_.Exception.Message)"
    }
}

# Shows the certificate NOBS presents and asks whether to trust it. Yes pins its thumbprint (and keeps it in the settings
# file, unless the setup saves it later). Windows PowerShell 5.1 only: PowerShell 7 ignores a pinned thumbprint.
function Confirm-TrustCertificate([switch]$NoSave) {
    $cert = Get-NobsCertificate
    Write-Host "Windows does not trust the certificate of $(([Uri]$Config.NobsUrl).Host): $($cert.Subject), thumbprint $($cert.Thumbprint), valid until $($cert.NotAfter.ToString('yyyy-MM-dd'))" -ForegroundColor Yellow
    if ((Read-Host 'Trust this certificate for the push? (y/n)') -notmatch '^[yj]') { return $false }
    $Config.NobsCertThumbprint = $cert.Thumbprint
    Set-NobsCertificatePin
    if (-not $NoSave) { Save-LocalConfig $script:LocalConfig @{ NobsUrl = $Config.NobsUrl; NobsCertThumbprint = $Config.NobsCertThumbprint }; Write-PushLog "Certificate $($cert.Thumbprint) trusted, kept in $($script:LocalConfig)" }
    return $true
}

# Asks for the address and the token, checks both against the server, and keeps them.
function Invoke-Setup {
    Write-Host ''
    Write-Host 'NOBS Inventory push - setup' -ForegroundColor Cyan
    $default = if ($Config.NobsUrl -notmatch 'example\.com') { $Config.NobsUrl } else { '' }
    for (;;) {
        $answer = Read-Host ("Address of NOBS Inventory, as in the browser" + $(if ($default) { " [$default]" } else { ' (e.g. https://inventory.example.ch)' }))
        if (-not $answer) { $answer = $default }
        try { $Config.NobsUrl = Get-NobsUrlText $answer } catch { Write-Host $_.Exception.Message -ForegroundColor Yellow; continue }
        if (-not $Config.NobsUrl) { continue }
        Set-NobsCertificatePin
        try { Invoke-RestMethod -Uri ($Config.NobsUrl + '/api/health') -TimeoutSec 20 | Out-Null; break }
        catch {
            $msg = if ($_.Exception.InnerException) { $_.Exception.InnerException.Message } else { $_.Exception.Message }
            if ($msg -match 'trust|certificate|SSL|TLS|Zertifikat') {
                if ($Config.NobsCertThumbprint) { throw "The trusted certificate is still refused: $msg. Run the script with Windows PowerShell 5.1 (powershell.exe); PowerShell 7 does not use a trusted thumbprint." }
                if (Confirm-TrustCertificate -NoSave) { continue }
            } else { Write-Host "No answer from $($Config.NobsUrl): $msg" -ForegroundColor Yellow }
        }
    }
    Write-Host "Connected to $($Config.NobsUrl)" -ForegroundColor Green
    for ($try = 1; ; $try++) {
        $secure = Read-Host -AsSecureString 'Feed token (NOBS: Settings -> Feed -> Create token)'
        $plain = (New-Object System.Management.Automation.PSCredential('x', $secure)).GetNetworkCredential().Password
        $why = Test-NobsToken $plain
        # 403: the token is right, but NOBS takes no push yet. Keep it and say what to turn on.
        if ($why -like 'NOBS takes no push*') { Write-Host $why -ForegroundColor Yellow; break }
        if (-not $why) { break }
        Write-Host $why -ForegroundColor Yellow
        if ($try -ge 3) { throw 'The token was not accepted. Run .\Lansweeper-Push.ps1 -Setup to try again.' }
    }
    Save-Token $secure
    Save-LocalConfig $script:LocalConfig @{ NobsUrl = $Config.NobsUrl; NobsCertThumbprint = $Config.NobsCertThumbprint }
    Write-PushLog "Setup saved: $($Config.NobsUrl) in $($script:LocalConfig), the token for $env:USERNAME on $env:COMPUTERNAME"
    # The Lansweeper database: when this account cannot open it, offer Lansweeper's own login.
    try { (Open-LsConnection).Close(); Write-Host 'The Lansweeper database opens.' -ForegroundColor Green }
    catch {
        Write-Host "The Lansweeper database does not open for $env:USERNAME`: $($_.Exception.Message)" -ForegroundColor Yellow
        if ((Read-Host "Use the database login Lansweeper itself uses, read from its configuration at each run? Needs administrator rights. (y/n)") -match '^[yj]') {
            $Config.SqlFromLansweeper = $true; $Config.SqlUseStoredCredential = $false
            (Open-LsConnection).Close()
            Write-Host 'The Lansweeper database opens with Lansweeper''s own login.' -ForegroundColor Green
            Save-LocalConfig $script:LocalConfig @{ SqlFromLansweeper = $true; SqlUseStoredCredential = $false }
            Write-PushLog "Lansweeper's own database login is used, read at each run (kept in $($script:LocalConfig))"
        } else { Write-Host 'Store a SQL login with .\Lansweeper-Push.ps1 -SetSqlCredential, or run the push as an account with database rights.' }
    }
}
$script:Interactive = [Environment]::UserInteractive -and -not ([Environment]::GetCommandLineArgs() -match '^-NonI')

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
# A column of a joined table is read only when its join is made ($Joined); otherwise it is NULL, so the query still runs.
function Get-SelectItem([string]$Table, [string]$Alias, [string]$Col, [bool]$Joined = $true) {
    $out = "${Alias}__$Col"
    if ($Joined -and (Test-Col $Table $Col)) { return "$Alias.[$($script:Cols[$Table][$Col.ToLowerInvariant()])] AS [$out]" }
    return "CAST(NULL AS nvarchar(200)) AS [$out]"
}

# The configuration files that may hold Lansweeper's database login: the one of its service (found by the service's path),
# then the usual places of the service and of the website.
function Get-LansweeperConfigFiles {
    $files = New-Object System.Collections.Generic.List[string]
    try {
        Get-CimInstance Win32_Service -ErrorAction Stop | Where-Object { $_.Name -like 'Lansweeper*' -and $_.PathName } | ForEach-Object {
            $exe = ($_.PathName -replace '^"([^"]+)".*$', '$1') -replace '^(\S+\.exe).*$', '$1'
            $files.Add("$exe.config"); $files.Add((Join-Path (Split-Path $exe) 'Lansweeper.Service.dll.config'))
        }
    } catch { }
    foreach ($root in @(${env:ProgramFiles(x86)}, $env:ProgramFiles) | Where-Object { $_ }) {
        foreach ($rel in @('Lansweeper\Service\Lansweeper.Service.exe.config', 'Lansweeper\Service\lansweeperservice.exe.config', 'Lansweeper\Website\web.config')) { $files.Add((Join-Path $root $rel)) }
    }
    return @($files | Select-Object -Unique | Where-Object { Test-Path -LiteralPath $_ })
}

# The connection string Lansweeper uses, from the first of its configuration files that has one. A protected (encrypted)
# section is opened by .NET with the machine's key, which needs administrator rights.
function Get-LansweeperConnectionString {
    $files = Get-LansweeperConfigFiles
    if (-not $files) { throw 'No Lansweeper configuration was found on this machine. Run the push on the Lansweeper server, or set SqlConnectionString.' }
    Add-Type -AssemblyName System.Configuration
    $why = @()
    foreach ($f in $files) {
        try {
            $map = New-Object System.Configuration.ExeConfigurationFileMap
            $map.ExeConfigFilename = $f
            $cfg = [System.Configuration.ConfigurationManager]::OpenMappedExeConfiguration($map, [System.Configuration.ConfigurationUserLevel]::None)
            foreach ($cs in $cfg.ConnectionStrings.ConnectionStrings) {
                if ($cs.ConnectionString -match '(?i)(initial catalog|database)\s*=') { return $cs.ConnectionString }
            }
            $why += "$f has no database connection"
        } catch { $why += "$f`: $($_.Exception.Message)" }
    }
    throw ("Lansweeper's database login could not be read (run as administrator, in Windows PowerShell 5.1). " + ($why -join '; '))
}

function Show-LansweeperDb {
    $csb = New-Object System.Data.SqlClient.SqlConnectionStringBuilder (Get-LansweeperConnectionString)
    Write-PushLog "Lansweeper's database: server $($csb.DataSource), database $($csb.InitialCatalog), $(if ($csb.IntegratedSecurity) { 'Windows login' } else { "user $($csb.UserID)" }). The password is not shown."
}

function Open-LsConnection {
    $csb = if ($Config.SqlFromLansweeper) { New-Object System.Data.SqlClient.SqlConnectionStringBuilder (Get-LansweeperConnectionString) }
           else { New-Object System.Data.SqlClient.SqlConnectionStringBuilder $Config.SqlConnectionString }
    if ($Config.SqlUseStoredCredential -and -not $Config.SqlFromLansweeper) {
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
        $cmd.CommandText = "SELECT TABLE_NAME, COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME LIKE '%port%' OR TABLE_NAME LIKE '%switch%' OR TABLE_NAME LIKE '%connect%' OR TABLE_NAME LIKE '%network%' OR TABLE_NAME LIKE '%monitor%' OR TABLE_NAME LIKE '%soft%' OR TABLE_NAME LIKE '%install%' OR TABLE_NAME LIKE '%bios%' OR TABLE_NAME LIKE '%firmware%' OR TABLE_NAME LIKE '%boot%' OR TABLE_NAME LIKE '%uptime%' OR TABLE_NAME LIKE '%disk%' OR TABLE_NAME LIKE '%drive%' OR TABLE_NAME LIKE '%volume%' OR TABLE_NAME LIKE '%quickfix%' OR TABLE_NAME LIKE '%patch%' OR TABLE_NAME LIKE '%hotfix%' OR TABLE_NAME LIKE '%update%' OR TABLE_NAME LIKE '%antivir%' OR TABLE_NAME LIKE '%virus%' OR TABLE_NAME LIKE '%defender%' OR TABLE_NAME LIKE '%security%' ORDER BY TABLE_NAME, ORDINAL_POSITION"
        $reader = $cmd.ExecuteReader()
        $lines = New-Object System.Collections.Generic.List[string]
        try { while ($reader.Read()) { $lines.Add("$($reader[0]).$($reader[1])") } } finally { $reader.Close() }
        return , $lines.ToArray()
    } finally { $conn.Dispose() }
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

# Firmware, last power event, disks, last update and antivirus per asset. Each part is left out when its table is missing.
function Get-HealthByAsset($conn) {
    $health = @{}
    function Get-Entry($id) { if (-not $health.ContainsKey($id)) { $health[$id] = @{} }; return $health[$id] }
    if (Test-Col 'tblBIOS' 'Version') {
        $r = $conn.CreateCommand(); $r.CommandText = 'SELECT [AssetID], [Version] FROM [tblBIOS]'
        $rd = $r.ExecuteReader()
        try { while ($rd.Read()) { $id = ConvertTo-Text $rd['AssetID']; $v = Get-Clean $rd['Version']; if ($id -and $v -and -not (Get-Entry $id).ContainsKey('fw')) { (Get-Entry $id)['fw'] = $v } } } finally { $rd.Close() }
    }
    if (Test-Col 'tblUptime' 'EventTime') {
        $r = $conn.CreateCommand(); $r.CommandText = 'SELECT [AssetId], MAX([EventTime]) AS [last] FROM [tblUptime] GROUP BY [AssetId]'
        $rd = $r.ExecuteReader()
        try { while ($rd.Read()) { $id = ConvertTo-Text $rd['AssetId']; if ($id -and $rd['last'] -is [datetime]) { (Get-Entry $id)['boot'] = $rd['last'].ToString('yyyy-MM-dd HH:mm') } } } finally { $rd.Close() }
    }
    if (Test-Col 'tblVolume' 'DriveLetter') {
        $type = if (Test-Col 'tblVolume' 'DriveType') { '[DriveType]' } else { 'NULL AS [DriveType]' }
        $r = $conn.CreateCommand(); $r.CommandText = "SELECT [AssetID], [DriveLetter], [Capacity], [FreeSpace], $type FROM [tblVolume] WHERE [DriveLetter] IS NOT NULL"
        $rd = $r.ExecuteReader()
        try { while ($rd.Read()) {
            $id = ConvertTo-Text $rd['AssetID']; $letter = ConvertTo-Text $rd['DriveLetter']
            if (-not $id -or -not $letter) { continue }
            $e = Get-Entry $id
            $capacity = ConvertTo-Text $rd['Capacity']; $free = ConvertTo-Text $rd['FreeSpace']
            # A CD/DVD drive (drive type 5) is listed as optical; it has no size, or only that of the disc in it.
            $size = if ((ConvertTo-Text $rd['DriveType']) -eq '5') { 'optical' } elseif ($capacity -match '^\d+$') { '{0:N0}/{1:N0} GB' -f ([double]$free / 1GB), ([double]$capacity / 1GB) } else { '' }
            $e['disk'] = (@($e['disk'], "$($letter.TrimEnd(':')): $size".Trim()) | Where-Object { $_ }) -join '; '
        } } finally { $rd.Close() }
    }
    if (Test-Col 'tblQuickFixEngineering' 'InstalledOn') {
        $r = $conn.CreateCommand(); $r.CommandText = 'SELECT [AssetID], [QFEID], [InstalledOn] FROM [tblQuickFixEngineering] WHERE [InstalledOn] IS NOT NULL'
        $rd = $r.ExecuteReader()
        try { while ($rd.Read()) {
            $id = ConvertTo-Text $rd['AssetID']; $date = $rd['InstalledOn']
            if (-not $id -or -not ($date -is [datetime])) { continue }
            $e = Get-Entry $id
            if (-not $e.ContainsKey('patchDate') -or $date -gt $e['patchDate']) { $e['patchDate'] = $date; $e['patch'] = "$(ConvertTo-Text $rd['QFEID']) ($($date.ToString('yyyy-MM-dd')))" }
        } } finally { $rd.Close() }
    }
    if (Test-Col 'tblAntivirus' 'DisplayName') {
        $r = $conn.CreateCommand(); $r.CommandText = 'SELECT [AssetID], [DisplayName], [onAccessScanningEnabled], [productUpToDate] FROM [tblAntivirus]'
        $rd = $r.ExecuteReader()
        try { while ($rd.Read()) {
            $id = ConvertTo-Text $rd['AssetID']; $name = Get-Clean $rd['DisplayName']
            if (-not $id -or -not $name) { continue }
            $on = ([string]$rd['onAccessScanningEnabled']) -in @('1', 'True'); $upd = ([string]$rd['productUpToDate']) -in @('1', 'True')
            # A device can have more than one product (Windows Defender next to another one): all are kept, each once.
            $e = Get-Entry $id; $one = "$name, " + $(if ($on) { 'scanning on' } else { 'scanning OFF' }) + ', ' + $(if ($upd) { 'up to date' } else { 'out of date' })
            if (-not $e['av']) { $e['av'] = $one } elseif (($e['av'] -split '; ') -notcontains $one) { $e['av'] = "$($e['av']); $one" }
        } } finally { $rd.Close() }
    }
    return $health
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

# Virtual machines are their own type (no rack slot); a computer whose manufacturer or model says virtual is one.
$script:VmPattern = 'vmware|virtual|qemu|kvm|xen|hyper-v|virtualbox|parallels|bochs|nutanix|proxmox'
function Get-AssetTypeText($reader) {
    $type = Get-Clean $reader['ty__AssetTypename']
    if ($type -notmatch '^(Windows|Linux|VMware|Computer|Apple Mac)$') { return $type }
    $hardware = (@((Get-Clean $reader['c__Manufacturer']), (Get-Clean $reader['c__Model'])) | Where-Object { $_ }) -join ' '
    if ($hardware -match $script:VmPattern) { return 'Virtual machine' }
    return $type
}

# The logged-on user, unless it is a service account.
function Get-UserText($v) {
    $u = Get-Clean $v
    if ($u -match '^(system|local service|network service|administrator)$') { return '' }
    return $u
}

# Memory in MB (Lansweeper) as text in GB, e.g. "16 GB".
function Get-RamText($v) {
    $mb = ConvertTo-Text $v
    if ($mb -notmatch '^\d+$' -or [int]$mb -le 0) { return '' }
    return ('{0} GB' -f ([math]::Round([double]$mb / 1024, 1)).ToString([Globalization.CultureInfo]::InvariantCulture))
}

# A date as yyyy-MM-dd. Lansweeper writes 1900-01-01 for no date.
function Get-DateText($v) {
    if ($v -is [datetime]) { if ($v.Year -lt 1990) { return '' } return $v.ToString('yyyy-MM-dd') }
    $t = Get-Clean $v
    if ($t -match '^(\d{4})-(\d{2})-(\d{2})' -and [int]$Matches[1] -ge 1990) { return "$($Matches[1])-$($Matches[2])-$($Matches[3])" }
    return ''
}

# Win32_SystemEnclosure.ChassisTypes as a word: what the type rules look at to tell a notebook from a desktop.
function Get-ChassisText($v) {
    $t = (ConvertTo-Text $v) -replace '[^\d].*$', ''
    if ($t -notmatch '^\d+$') { return '' }
    $names = @{ 3 = 'desktop'; 4 = 'low profile desktop'; 5 = 'pizza box'; 6 = 'mini tower'; 7 = 'tower'; 8 = 'portable'; 9 = 'laptop'; 10 = 'notebook'
        11 = 'hand held'; 12 = 'docking station'; 13 = 'all in one'; 14 = 'sub notebook'; 15 = 'space-saving'; 16 = 'lunch box'; 17 = 'main server chassis'
        23 = 'rack mount chassis'; 24 = 'sealed-case pc'; 30 = 'tablet'; 31 = 'convertible'; 32 = 'detachable'; 33 = 'iot gateway'; 34 = 'embedded pc'; 35 = 'mini pc'; 36 = 'stick pc' }
    if ($names.ContainsKey([int]$t)) { return $names[[int]$t] } else { return '' }
}

# Win32_ComputerSystem.DomainRole: 0-1 workstation, 2-3 server, 4-5 domain controller.
function Get-RoleText($v) {
    $t = ConvertTo-Text $v
    if ($t -notmatch '^\d$') { return '' }
    switch ([int]$t) { { $_ -le 1 } { return 'workstation' } { $_ -le 3 } { return 'server' } default { return 'dc' } }
}

# The first IPv4 address in a list Lansweeper keeps as text ("10.1.1.5, fe80::1" or "10.1.1.5;10.1.1.6").
function Get-FirstV4($v) {
    foreach ($x in ((ConvertTo-Text $v) -split '[,;\s]+')) { if ($x -match '^\d{1,3}(\.\d{1,3}){3}$' -and $x -ne '0.0.0.0') { return $x } }
    return ''
}

# The first global IPv6 address in such a list: link-local (fe80::), loopback and unspecified ones are left out.
function Get-FirstV6($v) {
    foreach ($x in ((ConvertTo-Text $v) -split '[,;\s]+')) {
        $a = ($x -replace '%.*$', '').ToLowerInvariant()
        if ($a -match '^[0-9a-f:]+$' -and $a.Contains(':') -and $a -notmatch '^(fe[89ab][0-9a-f]:|::1?$)') { return $a }
    }
    return ''
}

# Each asset's network adapters with an address: address, mask, gateway, DNS servers and DHCP.
function Get-AdapterByAsset($conn) {
    $map = @{}
    $cols = @('AssetID', 'IPAddress', 'IPSubnet', 'DefaultIPGateway', 'DNSServerSearchOrder', 'DHCPEnabled', 'MACAddress', 'Caption', 'Description')
    if (-not ((Test-Col 'tblNetwork' 'AssetID') -and (Test-Col 'tblNetwork' 'IPAddress') -and (Test-Col 'tblNetwork' 'IPSubnet'))) { return $map }
    $select = ($cols | ForEach-Object { Get-SelectItem 'tblNetwork' 'n' $_ }) -join ', '
    $where = if (Test-Col 'tblNetwork' 'IPEnabled') { 'WHERE n.[IPEnabled] = 1' } else { '' }
    $cmd = $conn.CreateCommand()
    $cmd.CommandText = "SELECT $select FROM [tblNetwork] n $where"
    $cmd.CommandTimeout = 300
    $reader = $cmd.ExecuteReader()
    try {
        while ($reader.Read()) {
            $id = ConvertTo-Text $reader['n__AssetID']
            $ip = Get-FirstV4 $reader['n__IPAddress']
            if (-not $id -or -not $ip) { continue }
            $dns = @((ConvertTo-Text $reader['n__DNSServerSearchOrder']) -split '[,;\s]+' | Where-Object { $_ -match '^\d{1,3}(\.\d{1,3}){3}$' }) -join ', '
            $dhcpText = ConvertTo-Text $reader['n__DHCPEnabled']
            if (-not $map.ContainsKey($id)) { $map[$id] = New-Object System.Collections.Generic.List[object] }
            $mac = (Get-Clean $reader['n__MACAddress']) -replace '[^0-9a-fA-F]', ''
            $name = Get-Clean $reader['n__Description']; if (-not $name) { $name = Get-Clean $reader['n__Caption'] }
            $map[$id].Add(@{
                ip = $ip; ip6 = Get-FirstV6 $reader['n__IPAddress']; mask = Get-FirstV4 $reader['n__IPSubnet']; gateway = Get-FirstV4 $reader['n__DefaultIPGateway']; dns = $dns
                dhcp = $(if ($dhcpText -match '^(1|true)$') { 'dhcp' } elseif ($dhcpText -match '^(0|false)$') { 'static' } else { '' })
                mac = $(if ($mac.Length -eq 12) { (($mac -split '(..)' | Where-Object { $_ }) -join ':').ToLowerInvariant() } else { '' })
                name = ($name -replace '^\[\d+\]\s*', '')
            })
        }
    } finally { $reader.Close() }
    return $map
}

# The operating system as Windows names it, without "Microsoft" in front, with its version: Windows 10 Pro (10.0.19045).
# Lansweeper's short name (Win 10) when it has no full one, as for a device it reached without Windows.
function Get-OsText($caption, $version, $short) {
    $name = (Get-Clean $caption) -replace '^\s*Microsoft\s+', '' -replace '\s+', ' '
    if (-not $name) { return Get-Clean $short }
    $v = Get-Clean $version
    if ($v -and $name -notmatch [regex]::Escape($v)) { return "$name ($v)" }
    return $name
}

# The adapter that carries the asset's address, or else the first one with a gateway.
function Select-Adapter($nics, [string]$ip) {
    if (-not $nics) { return $null }
    foreach ($n in $nics) { if ($ip -and $n['ip'] -eq $ip) { return $n } }
    foreach ($n in $nics) { if ($n['gateway']) { return $n } }
    return $null
}

# The device's other adapters: every one with an IPv4 address except the main one and the virtual ones, each address once.
function Get-OtherAdapters($nics, $main, [string]$ip = '') {
    # Adapters that are not a second network of the device: virtual switches, VPN and tunnel adapters, loopback, Bluetooth.
    $virtual = 'hyper-v|vethernet|virtual|vmware|virtualbox|vpn|tap-|tap adapter|wan miniport|loopback|bluetooth|teredo|isatap|6to4|wireguard|tailscale|zerotier|anyconnect|fortinet|globalprotect|pangp|juniper|wi-fi direct|docker|npcap'
    $out = New-Object System.Collections.Generic.List[object]
    foreach ($n in @($nics)) {
        if (-not $n -or ($main -and $n['ip'] -eq $main['ip']) -or ($ip -and $n['ip'] -eq $ip) -or ($n['ip'] -like '169.254.*') -or ($n['name'] -match $virtual)) { continue }
        if ($out | Where-Object { $_.ip -eq $n['ip'] }) { continue }
        $out.Add([ordered]@{ name = $n['name']; ip = $n['ip']; mac = $n['mac']; mask = $n['mask']; gateway = $n['gateway']; dhcp = $n['dhcp'] })
    }
    return , $out.ToArray()
}

# Lansweeper's IP locations: named address ranges, often named after a site and room.
function Get-IpLocations($conn) {
    $list = New-Object System.Collections.Generic.List[object]
    if (-not ((Test-Col 'tsysIPLocations' 'IPLocation') -and (Test-Col 'tsysIPLocations' 'StartIP') -and (Test-Col 'tsysIPLocations' 'EndIP'))) { return , @() }
    $cmd = $conn.CreateCommand()
    $cmd.CommandText = 'SELECT [IPLocation], [StartIP], [EndIP] FROM [tsysIPLocations]'
    $reader = $cmd.ExecuteReader()
    try {
        while ($reader.Read()) {
            $name = Get-Clean $reader['IPLocation']; $from = Get-FirstV4 $reader['StartIP']; $to = Get-FirstV4 $reader['EndIP']
            if ($name -and $from -and $to) { $list.Add([ordered]@{ name = $name; from = $from; to = $to }) }
        }
    } finally { $reader.Close() }
    return , $list.ToArray()
}

# What the push leaves out, and why: assets not active in Lansweeper, assets not seen within MaxAgeDays, and assets
# without a name. Counted in Lansweeper itself, so the log says why the inventory has fewer devices than Lansweeper.
function Get-LeftOut($conn, [int]$Read) {
    $hasState = Test-Col 'tblAssetCustom' 'State'
    $useAge = $Config.MaxAgeDays -gt 0 -and (Test-Col 'tblAssets' 'Lastseen')
    $active = if ($hasState) { 'c.[State] = 1' } else { '1=1' }
    $cmd = $conn.CreateCommand()
    $cmd.CommandText = "SELECT COUNT(*) AS [total], " +
        $(if ($hasState) { "SUM(CASE WHEN c.[State] = 1 THEN 0 ELSE 1 END)" } else { '0' }) + " AS [inactive], " +
        $(if ($useAge) { "SUM(CASE WHEN $active AND (a.[Lastseen] IS NULL OR a.[Lastseen] < @since) THEN 1 ELSE 0 END)" } else { '0' }) + " AS [old] " +
        "FROM [tblAssets] a " + $(if ($hasState) { 'LEFT JOIN [tblAssetCustom] c ON c.[AssetID] = a.[AssetID]' } else { '' })
    if ($useAge) { [void]$cmd.Parameters.AddWithValue('@since', (Get-Date).AddDays(-$Config.MaxAgeDays)) }
    $reader = $cmd.ExecuteReader()
    try {
        if (-not $reader.Read()) { return $null }
        $num = { param($v) if ($v -is [DBNull] -or $null -eq $v -or "$v" -eq '') { 0 } else { [int]$v } }
        $total = & $num $reader['total']; $inactive = & $num $reader['inactive']; $old = & $num $reader['old']
        return [ordered]@{ total = $total; inactive = $inactive; old = $old; noName = [Math]::Max(0, $total - $inactive - $old - $Read) }
    } finally { $reader.Close() }
}
function Format-LeftOut($l) {
    if (-not $l) { return '' }
    $parts = @()
    if ($l.inactive) { $parts += "$($l.inactive) not active in Lansweeper (state other than Active)" }
    if ($l.old) { $parts += "$($l.old) not seen in the last $($Config.MaxAgeDays) days (MaxAgeDays; 0 sends all)" }
    if ($l.noName) { $parts += "$($l.noName) without a name" }
    if (-not $parts.Count) { return "Lansweeper has $($l.total) asset(s); all are sent" }
    return "Lansweeper has $($l.total) asset(s); left out: " + ($parts -join ', ')
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

        # Which joins this Lansweeper version allows; the columns read from them follow the same conditions.
        $hasNet = (Test-Col 'tblNetwork' 'AssetID') -and (Test-Col 'tblNetwork' 'DNSHostname')
        $hasCustom = Test-Col 'tblAssetCustom' 'AssetID'
        $hasCs = (Test-Col 'tblComputersystem' 'AssetID') -and (Test-Col 'tblComputersystem' 'Domainrole')
        $hasSe = (Test-Col 'tblSystemEnclosure' 'AssetID') -and (Test-Col 'tblSystemEnclosure' 'ChassisTypes')
        $hasAd = (Test-Col 'tblADusers' 'Username') -and (Test-Col 'tblADusers' 'Userdomain') -and (Test-Col 'tblADusers' 'Department') -and (Test-Col 'tblAssets' 'Userdomain')
        $hasOs = (Test-Col 'tsysOS' 'OScode') -and (Test-Col 'tblAssets' 'OScode')
        $hasOx = (Test-Col 'tblOperatingsystem' 'AssetID') -and (Test-Col 'tblOperatingsystem' 'Caption')
        $select = @(
            (Get-SelectItem 'tblAssets' 'a' 'AssetID'), (Get-SelectItem 'tblAssets' 'a' 'AssetName'),
            (Get-SelectItem 'tblAssets' 'a' 'Username'), (Get-SelectItem 'tblAssets' 'a' 'Userdomain'),
            (Get-SelectItem 'tblAssets' 'a' 'IPAddress'), (Get-SelectItem 'tblAssets' 'a' 'Mac'), (Get-SelectItem 'tblAssets' 'a' 'Lastseen'),
            (Get-SelectItem 'tblAssets' 'a' 'Memory'), (Get-SelectItem 'tblAssets' 'a' 'Processor'),
            (Get-SelectItem 'tblAssetCustom' 'c' 'Manufacturer' $hasCustom), (Get-SelectItem 'tblAssetCustom' 'c' 'Model' $hasCustom),
            (Get-SelectItem 'tblAssetCustom' 'c' 'Serialnumber' $hasCustom), (Get-SelectItem 'tblAssetCustom' 'c' 'Location' $hasCustom),
            (Get-SelectItem 'tblAssetCustom' 'c' 'Building' $hasCustom),
            (Get-SelectItem 'tblAssetCustom' 'c' 'PurchaseDate' $hasCustom), (Get-SelectItem 'tblAssetCustom' 'c' 'Warrantydate' $hasCustom),
            (Get-SelectItem 'tblComputersystem' 'cs' 'Domainrole' $hasCs), (Get-SelectItem 'tblSystemEnclosure' 'se' 'ChassisTypes' $hasSe), (Get-SelectItem 'tblADusers' 'ad' 'Department' $hasAd), (Get-SelectItem 'tblADusers' 'ad' 'Displayname' $hasAd),
            (Get-SelectItem 'tsysAssetTypes' 'ty' 'AssetTypename'), (Get-SelectItem 'tsysOS' 'os' 'OSname' $hasOs),
            (Get-SelectItem 'tblOperatingsystem' 'ox' 'Caption' $hasOx), (Get-SelectItem 'tblOperatingsystem' 'ox' 'Version' $hasOx),
            (Get-SelectItem 'tblNetwork' 'n' 'DNSHostname' $hasNet), (Get-SelectItem 'tblNetwork' 'n' 'DNSDomain' $hasNet)
        ) -join ', '

        $joins = ''
        if ($hasCustom) { $joins += 'LEFT JOIN [tblAssetCustom] c ON c.[AssetID] = a.[AssetID] ' }
        if ($hasNet) {
            $netDomain = if (Test-Col 'tblNetwork' 'DNSDomain') { ', MAX([DNSDomain]) AS [DNSDomain]' } else { '' }
            $joins += "LEFT JOIN (SELECT [AssetID], MAX([DNSHostname]) AS [DNSHostname]$netDomain FROM [tblNetwork] GROUP BY [AssetID]) n ON n.[AssetID] = a.[AssetID] "
        }
        $joins += 'LEFT JOIN [tsysAssetTypes] ty ON ty.[AssetType] = a.[Assettype] '
        if ($hasCs) {
            $joins += 'LEFT JOIN (SELECT [AssetID], MAX([Domainrole]) AS [Domainrole] FROM [tblComputersystem] GROUP BY [AssetID]) cs ON cs.[AssetID] = a.[AssetID] '
        }
        if ($hasSe) {
            $joins += 'LEFT JOIN (SELECT [AssetID], MAX([ChassisTypes]) AS [ChassisTypes] FROM [tblSystemEnclosure] GROUP BY [AssetID]) se ON se.[AssetID] = a.[AssetID] '
        }
        # The department and the full name of the logged-on user, from the Active Directory users Lansweeper scans.
        # tblAssets.Username is the login (sAMAccountName); Displayname is the name people read.
        if ($hasAd) {
            $adName = if (Test-Col 'tblADusers' 'Displayname') { ', MAX([Displayname]) AS [Displayname]' } else { '' }
            $joins += "LEFT JOIN (SELECT [Username], [Userdomain], MAX([Department]) AS [Department]$adName FROM [tblADusers] GROUP BY [Username], [Userdomain]) ad ON ad.[Username] = a.[Username] AND ad.[Userdomain] = a.[Userdomain] "
        }
        if ($hasOs) { $joins += 'LEFT JOIN [tsysOS] os ON os.[OScode] = a.[OScode] ' }
        if ($hasOx) {
            $osVer = if (Test-Col 'tblOperatingsystem' 'Version') { ', MAX([Version]) AS [Version]' } else { '' }
            $joins += "LEFT JOIN (SELECT [AssetID], MAX([Caption]) AS [Caption]$osVer FROM [tblOperatingsystem] GROUP BY [AssetID]) ox ON ox.[AssetID] = a.[AssetID] "
        }

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
                    os = Get-OsText $reader['ox__Caption'] $reader['ox__Version'] $reader['os__OSname']
                    model = (@((Get-Clean $reader['c__Manufacturer']), (Get-Clean $reader['c__Model'])) | Where-Object { $_ }) -join ' '
                    location = (@((Get-Clean $reader['c__Building']), (Get-Clean $reader['c__Location'])) | Where-Object { $_ }) -join ' / '
                    assetType = Get-AssetTypeText $reader
                    cpu = Get-Clean $reader['a__Processor']
                    ram = Get-RamText $reader['a__Memory']
                    user = Get-UserText $reader['a__Username']
                    domain = Get-Clean $reader['n__DNSDomain']
                    purchased = Get-DateText $reader['c__PurchaseDate']
                    warranty = Get-DateText $reader['c__Warrantydate']
                    scanned = Get-DateText $reader['a__Lastseen']
                    role = Get-RoleText $reader['cs__Domainrole']
                    chassis = Get-ChassisText $reader['se__ChassisTypes']
                    userDept = $(if (Get-UserText $reader['a__Username']) { Get-Clean $reader['ad__Department'] } else { '' })
                    userName = $(if (Get-UserText $reader['a__Username']) { Get-Clean $reader['ad__Displayname'] } else { '' })
                    ip6 = ''; mask = ''; gateway = ''; dns = ''; dhcp = ''
                    ref = ConvertTo-Text $reader['a__AssetID']
                    links = @()
                    software = $null
                    fw = ''; boot = ''; disk = ''; patch = ''; av = ''
                })
            }
        } finally { $reader.Close() }
        try { $script:LeftOut = Get-LeftOut $conn $list.Count } catch { Write-PushLog "Could not count the assets left out: $($_.Exception.Message)" 'WARN' }
        $adapters = Get-AdapterByAsset $conn
        foreach ($rec in $list) {
            $nic = Select-Adapter $adapters[[string]$rec['ref']] $rec['ip']
            if ($nic) { foreach ($k in @('ip6', 'mask', 'gateway', 'dns', 'dhcp')) { $rec[$k] = $nic[$k] } }
            # Sent only when the adapters could be read; then a device with one adapter sends an empty list.
            if ($adapters.Count) { $rec['nics'] = Get-OtherAdapters $adapters[[string]$rec['ref']] $nic $rec['ip'] }
        }
        $health = Get-HealthByAsset $conn
        foreach ($rec in $list) {
            $h = $health[$rec['ref']]
            foreach ($k in @('fw', 'boot', 'disk', 'patch', 'av')) { $rec[$k] = $(if ($h -and $h.ContainsKey($k)) { $h[$k] } else { '' }) }
        }
        $software = Get-SoftwareByAsset $conn
        if ($software) {
            foreach ($rec in $list) {
                $key = [string]$rec['ref']
                $items = New-Object System.Collections.Generic.List[object]
                if ($software.ContainsKey($key)) { foreach ($x in $software[$key]) { $items.Add($x) } }
                $rec['software'] = $items.ToArray()
            }
        }
        foreach ($m in (Get-MonitorRecords $conn)) { $list.Add($m) }
        $script:IpLocations = Get-IpLocations $conn
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
function Get-NobsCertificate {
    $uri = [Uri]$Config.NobsUrl
    $tcp = New-Object System.Net.Sockets.TcpClient $uri.Host, $uri.Port
    try {
        $ssl = New-Object System.Net.Security.SslStream $tcp.GetStream(), $false, ([System.Net.Security.RemoteCertificateValidationCallback] { param($a, $b, $c, $d) $true })
        try { $ssl.AuthenticateAsClient($uri.Host, $null, [System.Security.Authentication.SslProtocols]::Tls12, $false) }
        catch { throw "TLS handshake with $($uri.Host) failed: $(if ($_.Exception.InnerException) { $_.Exception.InnerException.Message } else { $_.Exception.Message })" }
        return New-Object System.Security.Cryptography.X509Certificates.X509Certificate2 $ssl.RemoteCertificate
    } finally { $tcp.Close() }
}
function Show-NobsCertificate {
    $uri = [Uri]$Config.NobsUrl
    $cert = Get-NobsCertificate
    if ($cert) {
        Write-PushLog "Certificate of $($uri.Host): $($cert.Subject)"
        Write-PushLog "Thumbprint: $($cert.Thumbprint)  (valid until $($cert.NotAfter.ToString('yyyy-MM-dd')))"
        Write-PushLog 'Put the thumbprint in NobsCertThumbprint. When the server certificate is replaced, put the new thumbprint here.'
    }
}

function Send-Records($records, [string]$Token) {
    Set-NobsCertificatePin
    $totals = @{ created = 0; updated = 0; linked = 0; unchanged = 0; ambiguous = 0; excluded = 0; detached = 0; skippedIp = 0; people = 0; links = 0; software = 0 }
    $url = $Config.NobsUrl.TrimEnd('/') + '/api/feed/push'
    for ($i = 0; $i -lt $records.Count; $i += $Config.BatchSize) {
        $last = [math]::Min($i + $Config.BatchSize - 1, $records.Count - 1)
        $batch = @($records[$i..$last])
        $payload = @{ records = $batch }
        # The IP locations go with the first batch; the server keeps them for the batches after it.
        if ($i -eq 0 -and $script:IpLocations) { $payload['ipLocations'] = @($script:IpLocations) }
        $body = ($payload | ConvertTo-Json -Depth 4 -Compress)
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
    if ($Setup) { Invoke-Setup; exit 0 }
    if ($SetCredential) {
        if ($Config.NobsUrl -match 'example\.com') { Invoke-Setup; exit 0 }
        $tok = Read-Host -AsSecureString 'Feed token (NOBS: Settings -> Feed -> Create token)'
        $why = Test-NobsToken (New-Object System.Management.Automation.PSCredential('x', $tok)).GetNetworkCredential().Password
        if ($why -like 'NOBS takes no push*') { Write-PushLog $why 'WARN' } elseif ($why) { throw $why }
        Save-Token $tok
        Write-PushLog "NOBS token checked and stored for $env:USERNAME on $env:COMPUTERNAME"
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
    if ($ShowLansweeperDb) { Show-LansweeperDb; exit 0 }
    if ($FindTables) {
        $lines = Find-LsTables
        $file = Join-Path $Config.DataDir 'tables.txt'
        $lines | Set-Content -Path $file -Encoding UTF8
        $lines | ForEach-Object { Write-Host $_ }
        Write-PushLog "Found $($lines.Count) column(s). Saved to $file"
        exit 0
    }

    # Not set up yet: ask, when someone is there to answer. A scheduled run says what to do instead.
    $needsSetup = ($Config.NobsUrl -match 'example\.com') -or -not (Test-Path (Join-Path $Config.DataDir 'cred-nobs.xml'))
    if ($needsSetup -and -not $DryRun -and -not $FindTables) {
        if ($script:Interactive) { Invoke-Setup }
        else { throw 'Not set up: run .\Lansweeper-Push.ps1 -Setup once, as the account that runs the push, to give the NOBS address and the feed token.' }
    }

    Write-PushLog 'Reading Lansweeper ...'
    $records = Get-LsRecords
    Write-PushLog "$($records.Count) active asset(s) with a name"
    $leftOut = Format-LeftOut $script:LeftOut
    if ($leftOut) { Write-PushLog $leftOut }

    if ($DryRun) {
        $records | Select-Object -First 3 | ForEach-Object { Write-PushLog ("  " + (($_.GetEnumerator() | ForEach-Object { "$($_.Key)=$($_.Value)" }) -join ' ')) }
        Write-PushLog 'Dry run: nothing was sent.'
        exit 0
    }

    $token = Get-StoredToken
    try { $totals = Send-Records $records $token }
    catch {
        # A certificate Windows does not trust (a self-signed one, say): when someone is there, offer to trust it and send again.
        $msg = "$($_.Exception.Message) $(if ($_.Exception.InnerException) { $_.Exception.InnerException.Message })"
        if (-not ($script:Interactive -and -not $Config.NobsCertThumbprint -and $msg -match 'trust|certificate|SSL|TLS|Zertifikat')) { throw }
        if (-not (Confirm-TrustCertificate)) { throw }
        $totals = Send-Records $records $token
    }
    Write-PushLog ("NOBS: {0} created, {1} updated, {2} linked, {3} unchanged, {4} ambiguous name(s) skipped, {5} excluded, {6} detached, {7} IP-only skipped" -f `
        $totals.created, $totals.updated, $totals.linked, $totals.unchanged, $totals.ambiguous, $totals.excluded, $totals.detached, $totals.skippedIp)
    Write-PushLog ("NOBS: {0} changes to people and device owners, {1} monitor links, {2} devices with software changes" -f `
        $totals.people, $totals.links, $totals.software)
    exit 0
} catch {
    $where = $_.InvocationInfo
    Write-PushLog "Failed: $($_.Exception.Message)" 'ERROR'
    if ($where -and $where.ScriptLineNumber) { Write-PushLog "  at line $($where.ScriptLineNumber): $($where.Line.Trim())" 'ERROR' }
    $inner = $_.Exception.InnerException
    Write-PushLog "  type: $($_.Exception.GetType().FullName)$(if ($inner) { '; inner: ' + $inner.GetType().FullName + ': ' + $inner.Message })" 'ERROR'
    Write-PushLog "  stack: $(($_.ScriptStackTrace -split "`n" | Select-Object -First 4) -join ' | ')" 'ERROR'
    exit 1
}
