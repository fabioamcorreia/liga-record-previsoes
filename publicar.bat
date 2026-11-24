@echo off
rem Envia a app e os dados (data\sync.json) para o GitHub Pages, para o telemóvel ficar atualizado.
cd /d "%~dp0"
rem O botão Publicar descarrega sync.json para as Transferências: se lá houver um mais recente, passa para data\
powershell -NoProfile -Command "$d = Join-Path $env:USERPROFILE 'Downloads'; $f = Get-ChildItem $d -Filter 'sync*.json' -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1; if ($f -and (-not (Test-Path 'data\sync.json') -or $f.LastWriteTime -gt (Get-Item 'data\sync.json').LastWriteTime)) { Move-Item -Force $f.FullName 'data\sync.json'; Write-Host ('Dados novos: ' + $f.Name + ' -> data\sync.json') } else { Write-Host 'Sem sync.json novo nas Transferencias: envio o que esta em data\' }"
git add -A
git commit -m "Atualizar dados %date% %time:~0,5%"
git push
echo.
echo Feito. O telemovel fica atualizado em 1-2 minutos (abre a app ou puxa para atualizar).
pause
