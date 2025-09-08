$ErrorActionPreference = 'SilentlyContinue'

Get-NetTCPConnection -LocalPort 5000 -State Listen -ErrorAction SilentlyContinue | ForEach-Object {
  try { Stop-Process -Id $_.OwningProcess -Force } catch {}
}

$env:NODE_ENV = 'test'
$env:WS_ENABLED = 'false'
$env:PORT = '5000'
$env:DATABASE_URL = 'postgresql://neondb_owner:npg_Fj6NmHzlk9PC@ep-gentle-poetry-ab47rgaw-pooler.eu-west-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require'
$env:SESSION_SECRET = 'test-session-secret-123456'
$env:APP_URL = 'http://localhost:5000'
$env:FRONTEND_URL = 'http://localhost:5000'
$env:CORS_ORIGINS = 'http://localhost:5000'

# Run server from TS sources so test-only routes/bypass are active
npx -y tsx server/index.ts


