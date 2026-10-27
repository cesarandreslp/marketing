# Primera instalación (y reinstalación segura): genera claves, levanta Postgres + n8n y crea las tablas.
# Uso: powershell -ExecutionPolicy Bypass -File scripts\instalar.ps1
$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot)

if (-not (Test-Path .env)) { Copy-Item .env.example .env }
$env_ = Get-Content .env -Raw
foreach ($k in "POSTGRES_PASSWORD", "N8N_ENCRYPTION_KEY", "APP_MASTER_KEY", "SESSION_SECRET", "POSTIZ_JWT_SECRET", "POSTIZ_DB_PASSWORD", "TEMPORAL_DB_PASSWORD") {
  # Solo rellena las vacías: nunca cambia una clave existente (n8n perdería sus credenciales).
  $nueva = [guid]::NewGuid().ToString("N") + [guid]::NewGuid().ToString("N")
  $env_ = $env_ -replace "(?m)^$k=\s*$", "$k=$nueva"
}
$pg = [regex]::Match($env_, "(?m)^POSTGRES_PASSWORD=(.+)$").Groups[1].Value.Trim()
$env_ = $env_.Replace('${POSTGRES_PASSWORD}', $pg)
[IO.File]::WriteAllText("$PWD\.env", $env_)

docker compose up -d
if ($LASTEXITCODE) { throw "docker compose falló. ¿Docker Desktop está abierto?" }

Write-Host "Esperando a Postgres..."
do { Start-Sleep 2; docker compose exec -T db pg_isready -U radar -d radar | Out-Null } while ($LASTEXITCODE)

npm install
npm run db:push

Write-Host ""
Write-Host "Listo."
Write-Host "  App:  npm run dev  ->  http://localhost:3000  (crea tu cuenta la primera vez)"
Write-Host "  n8n:  http://localhost:5678  (crea tu usuario la primera vez)"
Write-Host "  Las API keys, redes y fechas se ingresan en la app: Configuración."
