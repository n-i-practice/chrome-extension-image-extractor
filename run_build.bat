@echo off
cd /d "%~dp0"

rem dist フォルダーを削除
if exist dist (
    rmdir /s /q dist
)

call npm run build
copy manifest.json dist\manifest.json
call tree_repository.bat
