# MakoCode Cleanup Script
# Kill all MakoCode.exe + node processes holding port 8080
# Usage: powershell -File cleanup.ps1 [-Port 8080]

param(
    [int]$Port = 8080
)

$killed = @()

# 1. Kill MakoCode.exe process tree
$makoProcesses = Get-Process -Name "MakoCode" -ErrorAction SilentlyContinue
if ($makoProcesses) {
    foreach ($p in $makoProcesses) {
        Write-Host "Killing MakoCode.exe (PID: $($p.Id))..."
        taskkill /F /T /PID $p.Id 2>$null
        if ($LASTEXITCODE -eq 0) {
            $killed += "MakoCode.exe:$($p.Id)"
        }
    }
} else {
    Write-Host "No MakoCode.exe process found."
}

# 2. Find and kill process holding target port
$portProcess = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique
if ($portProcess) {
    foreach ($pidVal in $portProcess) {
        $proc = Get-Process -Id $pidVal -ErrorAction SilentlyContinue
        if ($proc) {
            Write-Host "Killing $($proc.ProcessName) (PID: $pidVal) holding port $Port..."
            taskkill /F /T /PID $pidVal 2>$null
            if ($LASTEXITCODE -eq 0) {
                $killed += "$($proc.ProcessName):$pidVal"
            }
        }
    }
} else {
    Write-Host "No process holding port $Port."
}

# 3. Fallback: kill all node.exe
$nodeProcesses = Get-Process -Name "node" -ErrorAction SilentlyContinue
if ($nodeProcesses) {
    foreach ($p in $nodeProcesses) {
        Write-Host "Killing node.exe (PID: $($p.Id))..."
        taskkill /F /T /PID $p.Id 2>$null
        $killed += "node.exe:$($p.Id)"
    }
}

Write-Host ""
if ($killed.Count -gt 0) {
    Write-Host "=== Cleanup complete. Killed: $($killed -join ', ') ==="
} else {
    Write-Host "=== Cleanup complete. Nothing to kill. ==="
}

Start-Sleep -Seconds 2
