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
    $env:DEVGOD_PROJECT_SLUG = (Split-Path -Leaf $repoRoot).ToLowerInvariant()
}

if (-not $env:DEVGOD_PROJECT_NAME) {
    $env:DEVGOD_PROJECT_NAME = $env:DEVGOD_PROJECT_SLUG
}

if (-not $env:DEVGOD_DOCKER_CONTAINER_NAME) {
    $env:DEVGOD_DOCKER_CONTAINER_NAME = "devgod-postgres-$($env:DEVGOD_PROJECT_SLUG)"
}

if (-not $env:DEVGOD_QDRANT_CONTAINER_NAME) {
    $env:DEVGOD_QDRANT_CONTAINER_NAME = "devgod-qdrant-$($env:DEVGOD_PROJECT_SLUG)"
}

if (-not $env:DEVGOD_QDRANT_URL) {
    $env:DEVGOD_QDRANT_URL = "http://127.0.0.1:$($env:DEVGOD_QDRANT_PORT)"
    if (-not $env:DEVGOD_QDRANT_PORT) {
        $env:DEVGOD_QDRANT_URL = "http://127.0.0.1:6333"
    }
}

if (-not $env:DEVGOD_POSTGRES_PASSWORD -or $env:DEVGOD_POSTGRES_PASSWORD -eq "devgod") {
    throw "DEVGOD_POSTGRES_PASSWORD must be set to a non-default local password before setup continues"
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

function Wait-DevgodQdrantHttp {
    param([Parameter(Mandatory = $true)][string]$Url)

    Write-Host "waiting for devgod-qdrant to answer $Url"
    for ($i = 0; $i -lt 60; $i++) {
        try {
            $base = [System.Uri]::new($Url)
            $builder = [System.UriBuilder]::new($base)
            if (-not $builder.Path.EndsWith("/")) {
                $builder.Path = "$($builder.Path)/"
            }
            $endpoint = [System.Uri]::new($builder.Uri, "collections")
            $response = Invoke-WebRequest -Uri $endpoint -Method Get -MaximumRedirection 0 -TimeoutSec 2
            if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 300) {
                return
            }
        } catch {
        }

        Start-Sleep -Seconds 2
    }

    docker logs $env:DEVGOD_QDRANT_CONTAINER_NAME --tail 100
    throw "devgod-qdrant did not answer health checks at $Url"
}

docker compose up -d devgod-postgres devgod-qdrant

Wait-DevgodContainerHealth -ContainerName $env:DEVGOD_DOCKER_CONTAINER_NAME -Label "devgod-postgres"
Wait-DevgodContainerHealth -ContainerName $env:DEVGOD_QDRANT_CONTAINER_NAME -Label "devgod-qdrant"
Wait-DevgodQdrantHttp -Url $env:DEVGOD_QDRANT_URL

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
Write-Host "qdrant: configured"
