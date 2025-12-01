@echo off
echo ========================================
echo   FlyPic - Development Mode
echo ========================================
echo.
echo Starting backend server...
echo Backend: http://localhost:5002
echo.
echo Please open another terminal and run:
echo   npm run dev:frontend
echo.
echo Frontend will be at: http://localhost:5173
echo.
echo Press Ctrl+C to stop backend
echo.

cd backend
call npm run dev
