Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

if (-not (Test-Path -LiteralPath ".env") -and (Test-Path -LiteralPath ".env.example")) {
    Copy-Item -LiteralPath ".env.example" -Destination ".env"
    Write-Host "created .env from .env.example"
}

Get-Content ".env" | ForEach-Object {
    if ($_ -match '^\s*#' -or $_ -notmatch '=') {
        return
    }

    $parts = $_ -split '=', 2
    $value = $parts[1].Trim('"')
    [System.Environment]::SetEnvironmentVariable($parts[0], $value)
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw "docker is required for local setup unless you provide a managed Postgres backend"
}

try {
    docker version | Out-Null
} catch {
    throw "docker is installed but not usable from this environment; enable Docker Desktop WSL integration or provide a managed Postgres backend"
}

if (-not $env:DEVGOD_PROJECT_REPO_PATH -or $env:DEVGOD_PROJECT_REPO_PATH -eq "/absolute/path/to/repo") {
    $env:DEVGOD_PROJECT_REPO_PATH = $repoRoot
}

if (-not $env:DEVGOD_PROJECT_SLUG) {
    $env:DEVGOD_PROJECT_SLUG = Split-Path -Leaf $repoRoot
}

if (-not $env:DEVGOD_PROJECT_NAME) {
    $env:DEVGOD_PROJECT_NAME = $env:DEVGOD_PROJECT_SLUG
}

if (-not $env:DEVGOD_DOCKER_CONTAINER_NAME) {
    $env:DEVGOD_DOCKER_CONTAINER_NAME = "devgod-postgres-$($env:DEVGOD_PROJECT_SLUG)"
}

docker compose up -d devgod-postgres

Write-Host "waiting for devgod-postgres to become healthy"
$healthy = $false
for ($i = 0; $i -lt 60; $i++) {
    $status = ""
    try {
        $status = docker inspect -f "{{.State.Health.Status}}" $env:DEVGOD_DOCKER_CONTAINER_NAME 2>$null
    } catch {
        $status = ""
    }

    if ($status -eq "healthy") {
        $healthy = $true
        break
    }

    Start-Sleep -Seconds 2
}

if (-not $healthy) {
    docker logs $env:DEVGOD_DOCKER_CONTAINER_NAME --tail 100
    throw "devgod-postgres did not become healthy"
}

if (-not (Test-Path -LiteralPath "node_modules")) {
    npm install
}

npm run migrate
npm run bootstrap
npm run verify:setup

Write-Host ""
Write-Host "devgod local setup complete"
Write-Host "workspace: $($env:DEVGOD_WORKSPACE_SLUG)"
Write-Host "project: $($env:DEVGOD_PROJECT_SLUG)"
Write-Host "database: configured"
