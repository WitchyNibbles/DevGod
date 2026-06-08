Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

if (-not (Test-Path -LiteralPath ".env") -and (Test-Path -LiteralPath ".env.example")) {
    Copy-Item -LiteralPath ".env.example" -Destination ".env"
    Write-Host "created .env from .env.example"
}

function Test-DevgodSafeEnvKey {
    param([Parameter(Mandatory = $true)][string]$Name)

    return $Name -match '^DEVGOD_[A-Z0-9_]+$'
}

function Trim-DevgodLeadingWhitespace {
    param([Parameter(Mandatory = $true)][string]$Value)

    return ($Value -replace '^\s+', '')
}

function Trim-DevgodTrailingWhitespace {
    param([Parameter(Mandatory = $true)][string]$Value)

    return ($Value -replace '\s+$', '')
}

function Strip-DevgodUnquotedComment {
    param([Parameter(Mandatory = $true)][string]$Value)

    $builder = [System.Text.StringBuilder]::new()
    $previousWasWhitespace = $false

    for ($i = 0; $i -lt $Value.Length; $i++) {
        $ch = $Value[$i]
        if ($ch -eq '#' -and ($builder.Length -eq 0 -or $previousWasWhitespace)) {
            break
        }

        [void]$builder.Append($ch)
        $previousWasWhitespace = [char]::IsWhiteSpace($ch)
    }

    return (Trim-DevgodTrailingWhitespace $builder.ToString())
}

function Unescape-DevgodDoubleQuotedValue {
    param([Parameter(Mandatory = $true)][string]$Value)

    $Value = $Value.Replace('\\', '\')
    $Value = $Value.Replace('\"', '"')
    $Value = $Value.Replace('\n', "`n")
    $Value = $Value.Replace('\r', "`r")
    $Value = $Value.Replace('\t', "`t")
    $Value = $Value.Replace('\$', '$')

    return $Value
}

function Import-DevgodEnvFile {
    param([Parameter(Mandatory = $true)][string]$Path)

    if (-not (Test-Path -LiteralPath $Path)) {
        return
    }

    Get-Content -LiteralPath $Path | ForEach-Object {
        $line = $_.TrimEnd()
        if ([string]::IsNullOrWhiteSpace($line) -or $line.TrimStart().StartsWith("#")) {
            return
        }

        if ($line -match '^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$') {
            $name = $Matches[1]
            if (Test-DevgodSafeEnvKey -Name $name) {
                if (Test-Path -LiteralPath "Env:$name") {
                    return
                }
                $value = Trim-DevgodLeadingWhitespace $Matches[2]
                if ($value -match '^"((?:\\.|[^"])*)"(?:\s+#.*)?$') {
                    $value = Unescape-DevgodDoubleQuotedValue $Matches[1]
                } elseif ($value -match "^'([^']*)'(?:\s+#.*)?$") {
                    $value = $Matches[1]
                } else {
                    $value = Strip-DevgodUnquotedComment $value
                }

                Set-Item -Path "Env:$name" -Value $value
            }
        }
    }
}

Import-DevgodEnvFile -Path ".env"

function Resolve-DevgodNpmScript {
    param(
        [Parameter(Mandatory = $true)][string]$Preferred,
        [Parameter(Mandatory = $true)][string]$Fallback
    )

    $packageJson = Get-Content -LiteralPath "package.json" -Raw | ConvertFrom-Json
    $scriptNames = @()
    if ($null -ne $packageJson.scripts) {
        $scriptNames = $packageJson.scripts.PSObject.Properties.Name
    }

    if ($scriptNames -contains $Preferred) {
        return $Preferred
    }

    if ($scriptNames -contains $Fallback) {
        return $Fallback
    }

    throw "missing npm script aliases: $Preferred or $Fallback"
}

function Invoke-DevgodNpmScript {
    param(
        [Parameter(Mandatory = $true)][string]$Preferred,
        [Parameter(Mandatory = $true)][string]$Fallback
    )

    $scriptName = Resolve-DevgodNpmScript -Preferred $Preferred -Fallback $Fallback
    npm run $scriptName
}

function Test-DevgodScript {
    param(
        [Parameter(Mandatory = $true)][string]$Preferred,
        [Parameter(Mandatory = $true)][string]$Fallback
    )

    try {
        [void](Resolve-DevgodNpmScript -Preferred $Preferred -Fallback $Fallback)
        return $true
    } catch {
        return $false
    }
}

function Resolve-DevgodRuntimeModeFromProfile {
    param([string]$Profile)

    switch ($Profile.ToLowerInvariant()) {
        "local-docker" { return "docker" }
        "local-native" { return "native" }
        "managed" { return "managed" }
        default { return $null }
    }
}

function Resolve-DevgodRuntimeProfile {
    param([Parameter(Mandatory = $true)][string]$Mode)

    switch ($Mode) {
        "docker" { return "local-docker" }
        "native" { return "local-native" }
        "managed" { return "managed" }
        default { throw "unsupported runtime mode: $Mode" }
    }
}

function Test-DevgodDockerAvailable {
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
        return $false
    }

    try {
        docker version | Out-Null
        return $true
    } catch {
        return $false
    }
}

function Resolve-DevgodRuntimeMode {
    $requested = if ($env:DEVGOD_RUNTIME_MODE) { $env:DEVGOD_RUNTIME_MODE.ToLowerInvariant() } else { "auto" }
    switch ($requested) {
        "docker" { return "docker" }
        "native" { return "native" }
        "managed" { return "managed" }
        "auto" {
            if ($env:DEVGOD_RUNTIME_PROFILE) {
                $derived = Resolve-DevgodRuntimeModeFromProfile -Profile $env:DEVGOD_RUNTIME_PROFILE
                if ($derived -and $derived -ne "docker") {
                    return $derived
                }
            }
            if (Test-DevgodDockerAvailable) {
                return "docker"
            }
            throw "docker runtime is unavailable and native fallback is only supported on Linux/WSL; use DEVGOD_RUNTIME_MODE=managed or run the Unix setup path"
        }
        default {
            throw "invalid DEVGOD_RUNTIME_MODE: $requested"
        }
    }
}

if (-not $env:DEVGOD_PROJECT_REPO_PATH -or $env:DEVGOD_PROJECT_REPO_PATH -eq "/absolute/path/to/repo") {
    $env:DEVGOD_PROJECT_REPO_PATH = $repoRoot
}

if (-not $env:DEVGOD_PROJECT_SLUG) {
    $env:DEVGOD_PROJECT_SLUG = (Split-Path -Leaf $repoRoot).ToLowerInvariant()
}

if (-not $env:DEVGOD_PROJECT_NAME) {
    $env:DEVGOD_PROJECT_NAME = $env:DEVGOD_PROJECT_SLUG
}

if (-not $env:DEVGOD_WORKSPACE_SLUG) {
    $env:DEVGOD_WORKSPACE_SLUG = "default"
}

if (-not $env:DEVGOD_WORKSPACE_NAME) {
    $env:DEVGOD_WORKSPACE_NAME = "Default Workspace"
}

if (-not $env:DEVGOD_DOCKER_CONTAINER_NAME) {
    $env:DEVGOD_DOCKER_CONTAINER_NAME = "devgod-postgres-$($env:DEVGOD_PROJECT_SLUG)"
}

if (-not $env:DEVGOD_POSTGRES_PASSWORD -or $env:DEVGOD_POSTGRES_PASSWORD -eq "devgod") {
    throw "DEVGOD_POSTGRES_PASSWORD must be set to a non-default local password before setup continues"
}

if (-not $env:DEVGOD_POSTGRES_PORT) {
    $env:DEVGOD_POSTGRES_PORT = "5432"
}

if (-not $env:DEVGOD_CORE_DATABASE_URL) {
    $postgresUser = if ($env:DEVGOD_POSTGRES_USER) { $env:DEVGOD_POSTGRES_USER } else { "devgod" }
    $postgresDb = if ($env:DEVGOD_POSTGRES_DB) { $env:DEVGOD_POSTGRES_DB } else { "devgod" }
    $env:DEVGOD_CORE_DATABASE_URL = "postgres://${postgresUser}:$($env:DEVGOD_POSTGRES_PASSWORD)@127.0.0.1:$($env:DEVGOD_POSTGRES_PORT)/$postgresDb"
}

function Wait-DevgodContainerHealth {
    param(
        [Parameter(Mandatory = $true)][string]$ContainerName,
        [Parameter(Mandatory = $true)][string]$Label
    )

    Write-Host "waiting for $Label to become healthy"
    for ($i = 0; $i -lt 60; $i++) {
        $status = ""
        try {
            $status = docker inspect -f "{{.State.Health.Status}}" $ContainerName 2>$null
        } catch {
            $status = ""
        }

        if ($status -eq "healthy") {
            return
        }

        Start-Sleep -Seconds 2
    }

    docker logs $ContainerName --tail 100
    throw "$Label did not become healthy"
}

$runtimeMode = Resolve-DevgodRuntimeMode
$env:DEVGOD_RUNTIME_MODE = $runtimeMode
$env:DEVGOD_RUNTIME_PROFILE = Resolve-DevgodRuntimeProfile -Mode $runtimeMode

switch ($runtimeMode) {
    "docker" {
        if (-not (Test-DevgodDockerAvailable)) {
            throw "docker runtime mode selected but Docker is not available; use DEVGOD_RUNTIME_MODE=managed or run the Unix setup path for native fallback"
        }

        docker compose up -d devgod-postgres

        Wait-DevgodContainerHealth -ContainerName $env:DEVGOD_DOCKER_CONTAINER_NAME -Label "devgod-postgres"
    }
    "managed" {
    }
    "native" {
        throw "native runtime mode is only supported through the Unix/Linux setup path; use WSL bash setup or managed mode"
    }
}

if (-not (Test-Path -LiteralPath "node_modules")) {
    npm install
}

if ((Test-Path -LiteralPath ".devgod/install-manifest.json")) {
    try {
        git rev-parse --show-toplevel | Out-Null
        npm run devgod:setup:git-guard
    } catch {
    }
}

npm run devgod:setup:graphify

if (Test-DevgodScript -Preferred "devgod:setup:playwright" -Fallback "setup:playwright") {
    npm run devgod:setup:playwright
}

Invoke-DevgodNpmScript -Preferred "devgod:migrate" -Fallback "migrate"
Invoke-DevgodNpmScript -Preferred "devgod:bootstrap" -Fallback "bootstrap"
if (Test-Path -LiteralPath ".devgod/work/task-queue.json") {
    npm run devgod:repair-task-queue
}
npm run devgod:refresh-repo-context
npm run devgod:refresh-retrieval:fast
Invoke-DevgodNpmScript -Preferred "devgod:verify:setup" -Fallback "verify:setup"
if (Test-DevgodScript -Preferred "devgod:verify:playwright" -Fallback "verify:playwright") {
    npm run devgod:verify:playwright
}

Write-Host ""
Write-Host "devgod local setup complete"
Write-Host "runtime mode: $runtimeMode"
Write-Host "workspace: $($env:DEVGOD_WORKSPACE_SLUG)"
Write-Host "project: $($env:DEVGOD_PROJECT_SLUG)"
Write-Host "database: configured"
Write-Host "graphify: configured"
Write-Host "playwright: configured"
