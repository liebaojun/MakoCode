# MakoCode Wait-for-Server Script
# Poll http://127.0.0.1:PORT until server responds 200
# Usage: powershell -File wait-for-server.ps1 [-Port 8080] [-TimeoutSeconds 30]

param(
    [int]$Port = 8080,
    [int]$TimeoutSeconds = 30
)

$Url = "http://127.0.0.1:$Port"
$Elapsed = 0
$Interval = 1

Write-Host "Waiting for server at $Url ..."

while ($Elapsed -lt $TimeoutSeconds) {
    try {
        $response = Invoke-WebRequest -Uri $Url -Method GET -TimeoutSec 3 -UseBasicParsing
        if ($response.StatusCode -eq 200) {
            Write-Host "Server ready! (took ${Elapsed}s)"
            exit 0
        }
    } catch {
        # Server not up yet, keep waiting
    }

    Start-Sleep -Seconds $Interval
    $Elapsed = $Elapsed + $Interval
    Write-Host "  Waiting... (${Elapsed}s / ${TimeoutSeconds}s)"
}

Write-Host "ERROR: Server did not start within ${TimeoutSeconds}s" -ForegroundColor Red
exit 1
