# Set environment variables
$env:DATABASE_URL = "postgresql://neondb_owner:npg_Fj6NmHzlk9PC@ep-gentle-poetry-ab47rgaw-pooler.eu-west-2.aws.neon.tech/neondb?sslmode=require"
$env:LOCAL_DISABLE_REDIS = "true"
$env:SESSION_SECRET = "dev-session-secret-123456789"
$env:JWT_SECRET = "dev-jwt-secret-123456789"
$env:CORS_ORIGINS = "http://localhost:5173,http://localhost:3000,http://localhost:5000"
$env:APP_URL = "http://localhost:5000"
$env:BASE_URL = "http://localhost:5000"

Write-Host "Environment variables set successfully"
Write-Host "DATABASE_URL: $env:DATABASE_URL"

# Run the ensure-admin script
Write-Host "Running ensure-admin script..."
npx tsx scripts/ensure-admin.ts
