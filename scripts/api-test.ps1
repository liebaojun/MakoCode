# MakoCode API Test Script
# Standardized API tests: model info, model switch, mode switch, CORS
# Usage: powershell -File api-test.ps1 [-Port 8080]
# Exit: 0 = all pass, 1 = failures

param(
    [int]$Port = 8080
)

$BaseUrl = "http://127.0.0.1:$Port"
$Passed = 0
$Failed = 0

function Test-Api {
    param(
        [string]$Name,
        [string]$Method,
        [string]$Path,
        [string]$Body,
        [string]$ExpectedKey,
        $ExpectedValue
    )

    $url = "$BaseUrl$Path"
    $headers = @{
        "Origin" = "http://127.0.0.1:$Port"
        "Content-Type" = "application/json"
    }

    try {
        if ($Method -eq "GET") {
            $response = Invoke-WebRequest -Uri $url -Method GET -Headers $headers -TimeoutSec 10 -UseBasicParsing
        } elseif ($Method -eq "OPTIONS") {
            $response = Invoke-WebRequest -Uri $url -Method OPTIONS -Headers $headers -TimeoutSec 10 -UseBasicParsing
        } else {
            $response = Invoke-WebRequest -Uri $url -Method $Method -Headers $headers -Body $Body -TimeoutSec 10 -UseBasicParsing
        }

        $statusCode = $response.StatusCode
        $content = $response.Content | ConvertFrom-Json

        $ok = $true
        if ($ExpectedKey) {
            $actual = $content.$ExpectedKey
            if ($ExpectedValue -ne $null -and $actual -ne $ExpectedValue) {
                $ok = $false
                Write-Host "  FAIL: $Name - expected $ExpectedKey='$ExpectedValue', got '$actual'" -ForegroundColor Red
            }
        }

        if ($ok) {
            Write-Host "  PASS: $Name (HTTP $statusCode)" -ForegroundColor Green
            $script:Passed = $script:Passed + 1
        } else {
            $script:Failed = $script:Failed + 1
        }
    } catch {
        Write-Host "  FAIL: $Name - $_" -ForegroundColor Red
        $script:Failed = $script:Failed + 1
    }
}

Write-Host "=== MakoCode API Test Suite ==="
Write-Host "Base URL: $BaseUrl"
Write-Host ""

# 1. GET /api/model
Test-Api -Name "GET /api/model" -Method "GET" -Path "/api/model"

# 2. POST /api/model - Flash/Pro switch (API accepts "flash"/"pro" or full model name)
Test-Api -Name "POST /api/model (Flash)" -Method "POST" -Path "/api/model" -Body '{"model":"flash"}' -ExpectedKey "label" -ExpectedValue "Flash"

Test-Api -Name "POST /api/model (Pro)" -Method "POST" -Path "/api/model" -Body '{"model":"pro"}' -ExpectedKey "label" -ExpectedValue "Pro"

# Switch back to flash for subsequent tests
try {
    Invoke-RestMethod -Uri "$BaseUrl/api/model" -Method POST -Body '{"model":"flash"}' -ContentType "application/json" -TimeoutSec 5 | Out-Null
} catch {}

# 3. POST /api/mode - 4 modes (API returns {"mode":"<name>"})
$modes = @(
    @{Name="default"; Body='{"mode":"default"}'},
    @{Name="acceptEdits"; Body='{"mode":"acceptEdits"}'},
    @{Name="plan"; Body='{"mode":"plan"}'},
    @{Name="bypass"; Body='{"mode":"bypass"}'}
)

foreach ($m in $modes) {
    Test-Api -Name "POST /api/mode ($($m.Name))" -Method "POST" -Path "/api/mode" -Body $m.Body -ExpectedKey "mode" -ExpectedValue $m.Name
}

# 4. OPTIONS /api/model - CORS preflight
Test-Api -Name "OPTIONS /api/model (CORS)" -Method "OPTIONS" -Path "/api/model"

# 5. Verify CORS header has dynamic port
try {
    $corsResp = Invoke-WebRequest -Uri "$BaseUrl/api/model" -Method OPTIONS -Headers @{
        "Origin" = "http://127.0.0.1:$Port"
        "Access-Control-Request-Method" = "GET"
    } -TimeoutSec 10 -UseBasicParsing
    $acao = $corsResp.Headers["Access-Control-Allow-Origin"]
    if ($acao -eq "http://127.0.0.1:$Port") {
        Write-Host "  PASS: CORS Allow-Origin = $acao (dynamic port)" -ForegroundColor Green
        $Passed = $Passed + 1
    } else {
        Write-Host "  FAIL: CORS Allow-Origin = $acao (expected http://127.0.0.1:$Port)" -ForegroundColor Red
        $Failed = $Failed + 1
    }
} catch {
    Write-Host "  FAIL: CORS header check - $_" -ForegroundColor Red
    $Failed = $Failed + 1
}

Write-Host ""
Write-Host "=== Results: $Passed passed, $Failed failed ==="

if ($Failed -gt 0) {
    exit 1
} else {
    exit 0
}
