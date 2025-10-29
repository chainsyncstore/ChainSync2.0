@echo off
set DATABASE_URL=postgresql://neondb_owner:npg_Fj6NmHzlk9PC@ep-gentle-poetry-ab47rgaw-pooler.eu-west-2.aws.neon.tech/neondb?sslmode=require
set LOCAL_DISABLE_REDIS=true
set NODE_ENV=development
set SESSION_SECRET=dev-session-secret-123456789
set JWT_SECRET=dev-jwt-secret-123456789
set APP_URL=http://localhost:5001
set BASE_URL=http://localhost:5001
set PORT=5001
set CORS_ORIGINS=http://localhost:5173,http://localhost:3000,http://localhost:5001
echo Starting server on port 5001 with database connection...
npm run dev:server
