@echo off
REM Build and start script for Enterlist backend

echo Building Enterlist backend...
call npm run build

echo Starting server...
call npm run start:prod
