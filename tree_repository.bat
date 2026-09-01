@echo off
cd /d "%~dp0"

rem ASCII 罫線で出力
tree /f /a > tree_work.txt

setlocal enabledelayedexpansion

set skip=0

> tree_output.txt (
    for /f "usebackq delims=" %%L in ("tree_work.txt") do (
        set "line=%%L"

        rem 行頭の空白除去
        for /f "tokens=* delims= " %%A in ("!line!") do set "trimmed=%%A"

        rem === トップレベルフォルダー行の判定 (+-- と \--) ===
        set "prefix=!trimmed:~0,4!"

        if "!prefix!"=="+---" (
            set "folder=!trimmed:~4!"

            rem .git / node_modules はブロック除外
            if /i "!folder!"==".git" (
                set skip=1
            ) else if /i "!folder!"=="node_modules" (
                set skip=1
            ) else (
                set skip=0
            )
        ) else if "!prefix!"=="\---" (
            set "folder=!trimmed:~4!"

            rem .git / node_modules はブロック除外
            if /i "!folder!"==".git" (
                set skip=1
            ) else if /i "!folder!"=="node_modules" (
                set skip=1
            ) else (
                set skip=0
            )
        )

        rem skip=1 の間は出力しない（ブロック除外）
        if !skip! equ 0 (
            rem 必要ならここに通常出力処理を追加
            echo !line!
        )
    )
)

endlocal

del tree_work.txt
