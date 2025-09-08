$ErrorActionPreference = 'SilentlyContinue'

# Kill anything on port 5000
Get-NetTCPConnection -LocalPort 5000 -State Listen -ErrorAction SilentlyContinue | ForEach-Object {
  try { Stop-Process -Id $_.OwningProcess -Force } catch {}
}

# Set environment for test run
$env:NODE_ENV = 'test'
$env:WS_ENABLED = 'false'
$env:PORT = '5000'
$env:DATABASE_URL = 'postgresql://neondb_owner:npg_Fj6NmHzlk9PC@ep-gentle-poetry-ab47rgaw-pooler.eu-west-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require'
$env:SESSION_SECRET = 'test-session-secret-123456'
$env:APP_URL = 'http://localhost:5000'
$env:FRONTEND_URL = 'http://localhost:5000'
$env:CORS_ORIGINS = 'http://localhost:5000'

$outDir = "testsprite_tests\\tmp"
if(!(Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir | Out-Null }
$stdout = Join-Path $outDir 'server-stdout.log'
$stderr = Join-Path $outDir 'server-stderr.log'

# Start tsx server (TypeScript source) so test-only routes are active
Start-Process -FilePath "npx" -ArgumentList @('-y','tsx','server/index.ts') -RedirectStandardOutput $stdout -RedirectStandardError $stderr -WorkingDirectory (Get-Location) -WindowStyle Normal

Start-Sleep -Seconds 2
try { Invoke-RestMethod http://localhost:5000/healthz -TimeoutSec 5 | ConvertTo-Json -Depth 4 } catch { Write-Host "HEALTH_ERROR: $($_.Exception.Message)" }



