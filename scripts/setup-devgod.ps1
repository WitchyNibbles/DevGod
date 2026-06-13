Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

node -e 'const packageJson = require("./package.json"); process.exit(typeof packageJson.scripts?.["setup:local"] === "string" ? 0 : 1);'
if ($LASTEXITCODE -eq 0) {
    & npm run setup:local -- @args
} else {
    & npm run devgod -- setup-local @args
}

if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}
