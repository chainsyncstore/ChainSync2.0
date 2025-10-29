@echo off
set LOCAL_DISABLE_REDIS=true
set NODE_ENV=development
echo Starting server with Redis disabled...
npm run dev:server
