@echo off
chcp 65001 > nul
title 수암초 작품 허브
echo.
where node > nul 2> nul
if errorlevel 1 (
  echo Node.js 18 이상을 설치한 뒤 다시 실행해 주세요.
  pause
  exit /b 1
)

if not exist node_modules (
  echo 필요한 패키지를 설치합니다.
  call npm install
  if errorlevel 1 (
    echo 패키지 설치 중 오류가 발생했습니다.
    pause
    exit /b 1
  )
)

echo 웹페이지 주소: http://localhost:3000
start "" "http://localhost:3000"
call npm start
pause
