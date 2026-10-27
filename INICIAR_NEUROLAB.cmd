@echo off
title NeuroLab Enterprise CNN
if not exist "%~dp0apps\web\package.json" (
  echo No se encontro el frontend de NeuroLab.
  pause
) else (
  cd /d "%~dp0apps\web"
  call npm run dev -- --host 127.0.0.1 --port 5173
  pause
)
