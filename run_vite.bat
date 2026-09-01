@echo off
cd /d "%~dp0"

rem dist フォルダーを削除
if exist dist (
    rmdir /s /q dist
)

npm run dev || pause
