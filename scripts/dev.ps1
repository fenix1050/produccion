# Levanta el Cotizador Tajy para probarlo manualmente: backend (Express, :3000) y
# frontend (server estatico, :5000). Correr desde cualquier lado: .\scripts\dev.ps1
#
# Abre 2 ventanas de PowerShell separadas (una por proceso) para ver los logs de cada
# uno y poder cortar con Ctrl+C sin matar la otra.
#
# Gotcha ya pisado antes: el frontend se sirve desde la RAIZ del repo, no desde
# frontend/ - las paginas referencian logo/ (../../logo/...) como si la raiz servida
# fuera el repo completo. Por eso la URL final es /frontend/cotizar/, no /cotizar/.

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot

function Test-PortListening($port) {
    return [bool](Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)
}

if (Test-PortListening 3000) {
    Write-Host "Backend ya esta corriendo en el puerto 3000 - no se abre una instancia nueva." -ForegroundColor Yellow
} else {
    Write-Host "Iniciando backend (puerto 3000)..." -ForegroundColor Cyan
    Start-Process powershell -ArgumentList @(
        '-NoExit', '-Command',
        "cd '$root\backend'; npm run dev"
    )
}

if (Test-PortListening 5000) {
    Write-Host "Frontend ya esta corriendo en el puerto 5000 - no se abre una instancia nueva." -ForegroundColor Yellow
} else {
    Write-Host "Iniciando frontend (puerto 5000, servido desde la raiz del repo)..." -ForegroundColor Cyan
    Start-Process powershell -ArgumentList @(
        '-NoExit', '-Command',
        "cd '$root'; npx --yes serve -l 5000 ."
    )
}

Start-Sleep -Seconds 2
Write-Host ""
Write-Host "Cotizador: http://localhost:5000/frontend/cotizar/" -ForegroundColor Green
Write-Host "API:       http://localhost:3000/api/ramos" -ForegroundColor Green
Write-Host ""
Write-Host "Para cortar: cerra las 2 ventanas que se abrieron (o Ctrl+C en cada una)." -ForegroundColor DarkGray
