@echo off
echo Starting ChainSync Full Application...
echo =======================================

REM Set environment variables for backend
set DATABASE_URL=postgresql://neondb_owner:npg_Fj6NmHzlk9PC@ep-gentle-poetry-ab47rgaw-pooler.eu-west-2.aws.neon.tech/neondb?sslmode=require
set LOCAL_DISABLE_REDIS=true
set NODE_ENV=development
set SESSION_SECRET=dev-session-secret-123456789
set JWT_SECRET=dev-jwt-secret-123456789
set APP_URL=http://localhost:5001
set BASE_URL=http://localhost:5001
set PORT=5001
set CORS_ORIGINS=http://localhost:5173,http://localhost:3000,http://localhost:5001,http://127.0.0.1:5173
set COOKIE_DOMAIN=localhost

echo Starting Backend Server on port 5001...
start cmd /k "cd /d %cd% && npm run dev:server"

echo Waiting for backend to start...
timeout /t 5 /nobreak >nul

echo Starting Frontend on port 5173...
start cmd /k "cd /d %cd% && npm run dev:web"

echo =======================================
echo Application started!
echo Backend: http://localhost:5001
echo Frontend: http://localhost:5173
echo =======================================
echo.
echo Login with:
echo Email: admin@chainsync.com
echo Password: Admin123!
echo =======================================
pause
