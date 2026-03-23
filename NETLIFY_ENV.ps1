# DiskStation Monitor — Set Netlify env var and trigger frontend redeploy
# Run: Set-ExecutionPolicy Bypass -Scope Process -Force; .\NETLIFY_ENV.ps1

$RepoPath = "C:\Users\LionelMosley\Documents\HTML\Synology - DiskStation Monitor"
Set-Location $RepoPath
Write-Host "Configuring Netlify environment and redeploying frontend..." -ForegroundColor Cyan

# Update vite.config.ts to remove broken __API_URL__ define block
$b64 = "aW1wb3J0IHsgZGVmaW5lQ29uZmlnIH0gZnJvbSAndml0ZSc7CmltcG9ydCB7IHJlc29sdmUgfSBmcm9tICdwYXRoJzsKCmV4cG9ydCBkZWZhdWx0IGRlZmluZUNvbmZpZyh7CiAgcm9vdDogJy4nLAogIHB1YmxpY0RpcjogJ3B1YmxpYycsCiAgYnVpbGQ6IHsKICAgIG91dERpcjogJ2Rpc3QnLAogICAgcm9sbHVwT3B0aW9uczogewogICAgICBpbnB1dDogewogICAgICAgIGF1dGg6ICAgICAgcmVzb2x2ZShfX2Rpcm5hbWUsICdkc20tYXV0aC5odG1sJyksCiAgICAgICAgZGFzaGJvYXJkOiByZXNvbHZlKF9fZGlybmFtZSwgJ3N5bm9sb2d5LW1vbml0b3IuaHRtbCcpLAogICAgICB9LAogICAgfSwKICAgIHNvdXJjZW1hcDogZmFsc2UsCiAgICBtaW5pZnk6ICdlc2J1aWxkJywKICB9LAogIHNlcnZlcjogewogICAgcG9ydDogNTE3MywKICAgIHByb3h5OiB7CiAgICAgICcvYXBpJzogeyB0YXJnZXQ6ICdodHRwOi8vbG9jYWxob3N0OjMwMDEnLCBjaGFuZ2VPcmlnaW46IHRydWUgfSwKICAgICAgJy9hdXRoJzogeyB0YXJnZXQ6ICdodHRwOi8vbG9jYWxob3N0OjMwMDEnLCBjaGFuZ2VPcmlnaW46IHRydWUgfSwKICAgIH0sCiAgfSwKfSk7Cg=="
$bytes = [System.Convert]::FromBase64String($b64)
$fullPath = Join-Path $RepoPath "frontend\vite.config.ts"
[System.IO.File]::WriteAllBytes($fullPath, $bytes)
Write-Host "  updated frontend/vite.config.ts" -ForegroundColor Green

# Write the Netlify environment variable into the frontend source
# so VITE_API_URL is baked in at build time via netlify.toml
$netlifyToml = @'
[build]
  base    = "frontend"
  command = "npm run build"
  publish = "dist"

[build.environment]
  NODE_VERSION = "20"
  VITE_API_URL = "https://diskstation-monitor-production.up.railway.app"

[[redirects]]
  from   = "/*"
  to     = "/index.html"
  status = 200

[[headers]]
  for = "/assets/*"
  [headers.values]
    Cache-Control = "public, max-age=31536000, immutable"

[[headers]]
  for = "/*"
  [headers.values]
    X-Frame-Options         = "DENY"
    X-Content-Type-Options  = "nosniff"
    Referrer-Policy         = "strict-origin-when-cross-origin"
    Permissions-Policy      = "camera=(), microphone=(), geolocation=()"
    Content-Security-Policy = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://unpkg.com; font-src https://fonts.gstatic.com; img-src 'self' data: https://*.tile.openstreetmap.org; connect-src 'self' https://diskstation-monitor-production.up.railway.app https://nominatim.openstreetmap.org"
'@

[System.IO.File]::WriteAllText("$RepoPath\netlify.toml", $netlifyToml, [System.Text.Encoding]::UTF8)
Write-Host "  updated netlify.toml with VITE_API_URL" -ForegroundColor Green

git add frontend/vite.config.ts netlify.toml
git commit -m "feat: wire frontend to Railway backend URL via netlify.toml"
git push origin main

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n✅ Pushed! Netlify will now rebuild the frontend." -ForegroundColor Green
    Write-Host "   Frontend: https://diskstation-monitor.netlify.app" -ForegroundColor Cyan
    Write-Host "   Backend:  https://diskstation-monitor-production.up.railway.app" -ForegroundColor Cyan
    Write-Host "`n⚠  Still needed: Add PostgreSQL + Redis in Railway dashboard" -ForegroundColor Yellow
    Write-Host "   https://railway.app → tender-peace → +Add → Database → PostgreSQL" -ForegroundColor Yellow
    Write-Host "   https://railway.app → tender-peace → +Add → Database → Redis" -ForegroundColor Yellow
} else {
    Write-Host "`n❌ Push failed." -ForegroundColor Red
}