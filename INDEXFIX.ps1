# DiskStation Monitor — Fix root index.html and Netlify redirects
# Run: Set-ExecutionPolicy Bypass -Scope Process -Force; .\INDEXFIX.ps1

$RepoPath = "C:\Users\LionelMosley\Documents\HTML\Synology - DiskStation Monitor"
Set-Location $RepoPath
Write-Host "Adding root index.html and fixing redirects..." -ForegroundColor Cyan

# frontend/public/index.html
$b64 = "PCFET0NUWVBFIGh0bWw+CjxodG1sPgo8aGVhZD4KICA8bWV0YSBjaGFyc2V0PSJVVEYtOCI+CiAgPG1ldGEgaHR0cC1lcXVpdj0icmVmcmVzaCIgY29udGVudD0iMDt1cmw9L2RzbS1hdXRoLmh0bWwiPgogIDx0aXRsZT5EaXNrU3RhdGlvbiBNb25pdG9yPC90aXRsZT4KPC9oZWFkPgo8Ym9keT4KICA8c2NyaXB0PndpbmRvdy5sb2NhdGlvbi5yZXBsYWNlKCcvZHNtLWF1dGguaHRtbCcpOzwvc2NyaXB0PgogIDxwPlJlZGlyZWN0aW5nIHRvIDxhIGhyZWY9Ii9kc20tYXV0aC5odG1sIj5EaXNrU3RhdGlvbiBNb25pdG9yPC9hPi4uLjwvcD4KPC9ib2R5Pgo8L2h0bWw+Cg=="
$bytes = [System.Convert]::FromBase64String($b64)
$fullPath = Join-Path $RepoPath "frontend/public/index.html"
$dir = Split-Path $fullPath -Parent
if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
[System.IO.File]::WriteAllBytes($fullPath, $bytes)
Write-Host "  wrote frontend/public/index.html" -ForegroundColor Green

# netlify.toml
$b64 = "W2J1aWxkXQogIGJhc2UgICAgPSAiZnJvbnRlbmQiCiAgY29tbWFuZCA9ICJucG0gcnVuIGJ1aWxkIgogIHB1Ymxpc2ggPSAiZGlzdCIKCltidWlsZC5lbnZpcm9ubWVudF0KICBOT0RFX1ZFUlNJT04gPSAiMjAiCiAgVklURV9BUElfVVJMID0gImh0dHBzOi8vZGlza3N0YXRpb24tbW9uaXRvci1wcm9kdWN0aW9uLnVwLnJhaWx3YXkuYXBwIgoKW1tyZWRpcmVjdHNdXQogIGZyb20gICA9ICIvIgogIHRvICAgICA9ICIvZHNtLWF1dGguaHRtbCIKICBzdGF0dXMgPSAyMDAKCltbcmVkaXJlY3RzXV0KICBmcm9tICAgPSAiL2Rhc2hib2FyZCIKICB0byAgICAgPSAiL3N5bm9sb2d5LW1vbml0b3IuaHRtbCIKICBzdGF0dXMgPSAyMDAKCltbcmVkaXJlY3RzXV0KICBmcm9tICAgPSAiLyoiCiAgdG8gICAgID0gIi9kc20tYXV0aC5odG1sIgogIHN0YXR1cyA9IDIwMAoKW1toZWFkZXJzXV0KICBmb3IgPSAiL2Fzc2V0cy8qIgogIFtoZWFkZXJzLnZhbHVlc10KICAgIENhY2hlLUNvbnRyb2wgPSAicHVibGljLCBtYXgtYWdlPTMxNTM2MDAwLCBpbW11dGFibGUiCgpbW2hlYWRlcnNdXQogIGZvciA9ICIvKiIKICBbaGVhZGVycy52YWx1ZXNdCiAgICBYLUZyYW1lLU9wdGlvbnMgICAgICAgICA9ICJERU5ZIgogICAgWC1Db250ZW50LVR5cGUtT3B0aW9ucyAgPSAibm9zbmlmZiIKICAgIFJlZmVycmVyLVBvbGljeSAgICAgICAgID0gInN0cmljdC1vcmlnaW4td2hlbi1jcm9zcy1vcmlnaW4iCiAgICBQZXJtaXNzaW9ucy1Qb2xpY3kgICAgICA9ICJjYW1lcmE9KCksIG1pY3JvcGhvbmU9KCksIGdlb2xvY2F0aW9uPSgpIgogICAgQ29udGVudC1TZWN1cml0eS1Qb2xpY3kgPSAiZGVmYXVsdC1zcmMgJ3NlbGYnOyBzY3JpcHQtc3JjICdzZWxmJyBodHRwczovL3VucGtnLmNvbTsgc3R5bGUtc3JjICdzZWxmJyAndW5zYWZlLWlubGluZScgaHR0cHM6Ly9mb250cy5nb29nbGVhcGlzLmNvbTsgZm9udC1zcmMgaHR0cHM6Ly9mb250cy5nc3RhdGljLmNvbTsgaW1nLXNyYyAnc2VsZicgZGF0YTogaHR0cHM6Ly8qLnRpbGUub3BlbnN0cmVldG1hcC5vcmc7IGNvbm5lY3Qtc3JjICdzZWxmJyBodHRwczovL2Rpc2tzdGF0aW9uLW1vbml0b3ItcHJvZHVjdGlvbi51cC5yYWlsd2F5LmFwcCBodHRwczovL25vbWluYXRpbS5vcGVuc3RyZWV0bWFwLm9yZyIK"
$bytes = [System.Convert]::FromBase64String($b64)
$fullPath = Join-Path $RepoPath "netlify.toml"
$dir = Split-Path $fullPath -Parent
if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
[System.IO.File]::WriteAllBytes($fullPath, $bytes)
Write-Host "  wrote netlify.toml" -ForegroundColor Green

git add frontend/public/index.html netlify.toml
git commit -m "fix: add root index.html redirect and fix Netlify entry point routing"
git push origin main

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n✅ Pushed! Netlify will rebuild and dsm.4thandbailey.com will load correctly." -ForegroundColor Green
} else {
    Write-Host "`n❌ Push failed." -ForegroundColor Red
}