<#
.SYNOPSIS
    Pushes the assets of a Lansweeper Classic server to NOBS Inventory. Run it on the Lansweeper server.

.DESCRIPTION
    Reads the active assets from the Lansweeper database (SQL LocalDB or SQL Server) and sends them to
    NOBS Inventory at POST /api/feed/push. NOBS matches them by serial number, then by name, and merges
    the fields its policy allows (IP, MAC, OS, model). Nothing is deleted, and what you set by hand stays.

    The token is the one the NOBS administrator set on the server (NI_FEED_TOKEN). It is stored on this
    machine with -SetCredential, protected by Windows (DPAPI): only this user on this machine can read it.

    Runs with the built-in Windows PowerShell 5.1 (also PowerShell 7).

.EXAMPLE
    .\Lansweeper-Push.ps1 -SetCredential                 # store the NOBS feed token (DPAPI)
    .\Lansweeper-Push.ps1 -DryRun                        # read Lansweeper, show the first records, send nothing
    .\Lansweeper-Push.ps1                                # normal push
    .\Lansweeper-Push.ps1 -RegisterTask                  # daily scheduled task
#>
[CmdletBinding()]
param(
    [switch]$DryRun,
    [switch]$SetCredential,
    [switch]$RegisterTask,
    [string]$TaskTime = '06:30'
)

# ============================================================
# CONFIGURATION - adjust here, or in Lansweeper-Push.config.ps1 next to this script
# ============================================================
$Config = @{
    # Lansweeper database. LocalDB: run this script as the Windows user that installed Lansweeper.
    # Full SQL Server: e.g. 'Server=LSSERVER\SQLEXPRESS;Database=lansweeperdb;Integrated Security=True'
    SqlConnectionString = 'Server=(localdb)\.\LSInstance;Database=lansweeperdb;Integrated Security=True;Connect Timeout=30'

    # NOBS Inventory address, without /api. Use the same address the browser uses.
    NobsUrl             = 'https://inventory.argolite.ch'

    MaxAgeDays          = 90      # only assets Lansweeper has seen in the last N days (0 = all)
    BatchSize           = 500     # assets per request
    DataDir             = (Join-Path $env:ProgramData 'LansweeperNobsPush')   # credential and log
}
# ============================================================

$ErrorActionPreference = 'Stop'
$script:LocalConfig = Join-Path $PSScriptRoot 'Lansweeper-Push.config.ps1'
if (Test-Path -LiteralPath $script:LocalConfig) { . $script:LocalConfig }

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

function Get-LsRecords {
    $where = @('c.[State] = 1')
    $conn = New-Object System.Data.SqlClient.SqlConnection $Config.SqlConnectionString
    $conn.Open()
    try {
        $sql = @"
SELECT a.[AssetID], a.[AssetName], a.[Username], a.[Userdomain], a.[IPAddress], a.[Mac], a.[Lastseen],
       c.[Manufacturer], c.[Model], c.[Serialnumber], c.[Location], c.[Building],
       ty.[AssetTypename], os.[OSname]
FROM [tblAssets] a
LEFT JOIN [tblAssetCustom] c ON c.[AssetID] = a.[AssetID]
LEFT JOIN [tsysAssetTypes] ty ON ty.[AssetType] = a.[Assettype]
LEFT JOIN [tsysOS] os ON os.[OScode] = a.[OScode]
WHERE {0}
ORDER BY a.[AssetName]
"@
        if ($Config.MaxAgeDays -gt 0) { $where += 'a.[Lastseen] >= @since' }
        $cmd = $conn.CreateCommand()
        $cmd.CommandText = $sql -f ($where -join ' AND ')
        $cmd.CommandTimeout = 300
        if ($Config.MaxAgeDays -gt 0) { [void]$cmd.Parameters.AddWithValue('@since', (Get-Date).AddDays(-$Config.MaxAgeDays)) }
        $reader = $cmd.ExecuteReader()
        $list = New-Object System.Collections.Generic.List[object]
        try {
            while ($reader.Read()) {
                $name = Get-Clean $reader['AssetName']
                if (-not $name) { continue }
                $user = Get-Clean $reader['Username']
                $dom = Get-Clean $reader['Userdomain']
                $mac = (Get-Clean $reader['Mac']) -replace '[^0-9a-fA-F]', ''
                $list.Add([ordered]@{
                    name = $name
                    serial = Get-Clean $reader['Serialnumber']
                    ip = ConvertTo-FirstIPv4 $reader['IPAddress']
                    mac = $(if ($mac.Length -eq 12) { (($mac -split '(..)' | Where-Object { $_ }) -join ':').ToLowerInvariant() } else { '' })
                    os = Get-Clean $reader['OSname']
                    model = (@((Get-Clean $reader['Manufacturer']), (Get-Clean $reader['Model'])) | Where-Object { $_ }) -join ' '
                    location = (@((Get-Clean $reader['Building']), (Get-Clean $reader['Location'])) | Where-Object { $_ }) -join ' / '
                    assetType = Get-Clean $reader['AssetTypename']
                    ref = ConvertTo-Text $reader['AssetID']
                })
            }
        } finally { $reader.Close() }
        return , $list.ToArray()
    } finally { $conn.Dispose() }
}

function Send-Records($records, [string]$Token) {
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
    if ($RegisterTask) { Register-PushTask; exit 0 }

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
