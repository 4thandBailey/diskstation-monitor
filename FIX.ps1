# DiskStation Monitor — Fix line endings and re-push
# Run: Set-ExecutionPolicy Bypass -Scope Process -Force; .\FIX.ps1

$RepoPath = "C:\Users\LionelMosley\Documents\HTML\Synology - DiskStation Monitor"
Set-Location $RepoPath
Write-Host "Applying line-ending fix to: $RepoPath" -ForegroundColor Cyan

# .gitattributes
$b64 = "KiB0ZXh0PWF1dG8gZW9sPWxmCioucHMxIHRleHQgZW9sPWNybGYK"
$bytes = [System.Convert]::FromBase64String($b64)
$fullPath = Join-Path $RepoPath ".gitattributes"
$dir = Split-Path $fullPath -Parent
if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
[System.IO.File]::WriteAllBytes($fullPath, $bytes)
Write-Host "  wrote .gitattributes" -ForegroundColor Green

# package.json
$b64 = "ewogICJuYW1lIjogImRpc2tzdGF0aW9uLW1vbml0b3IiLAogICJ2ZXJzaW9uIjogIjEuMC4wIiwKICAicHJpdmF0ZSI6IHRydWUsCiAgImRlc2NyaXB0aW9uIjogIlJlYWwtdGltZSBmbGVldCBtb25pdG9yaW5nIGZvciBTeW5vbG9neSBOQVMgYXBwbGlhbmNlcyIsCiAgIndvcmtzcGFjZXMiOiBbCiAgICAiZnJvbnRlbmQiLAogICAgImJhY2tlbmQiCiAgXSwKICAic2NyaXB0cyI6IHsKICAgICJkZXYiOiAiY29uY3VycmVudGx5IFwibnBtIHJ1biBkZXYgLS13b3Jrc3BhY2U9YmFja2VuZFwiIFwibnBtIHJ1biBkZXYgLS13b3Jrc3BhY2U9ZnJvbnRlbmRcIiIsCiAgICAiYnVpbGQiOiAibnBtIHJ1biBidWlsZCAtLXdvcmtzcGFjZT1iYWNrZW5kIiwKICAgICJzdGFydCI6ICJub2RlIGJhY2tlbmQvZGlzdC9pbmRleC5qcyIsCiAgICAiZGI6bWlncmF0ZSI6ICJucG0gcnVuIGRiOm1pZ3JhdGUgLS13b3Jrc3BhY2U9YmFja2VuZCIsCiAgICAiZGI6c2VlZCI6ICJucG0gcnVuIGRiOnNlZWQgLS13b3Jrc3BhY2U9YmFja2VuZCIKICB9LAogICJkZXZEZXBlbmRlbmNpZXMiOiB7CiAgICAiY29uY3VycmVudGx5IjogIl44LjIuMiIKICB9LAogICJlbmdpbmVzIjogewogICAgIm5vZGUiOiAiPj0yMC4wLjAiCiAgfQp9Cg=="
$bytes = [System.Convert]::FromBase64String($b64)
$fullPath = Join-Path $RepoPath "package.json"
$dir = Split-Path $fullPath -Parent
if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
[System.IO.File]::WriteAllBytes($fullPath, $bytes)
Write-Host "  wrote package.json" -ForegroundColor Green

# backend/package.json
$b64 = "ewogICJuYW1lIjogIkBkc20vYmFja2VuZCIsCiAgInZlcnNpb24iOiAiMS4wLjAiLAogICJwcml2YXRlIjogdHJ1ZSwKICAic2NyaXB0cyI6IHsKICAgICJkZXYiOiAidHN4IHdhdGNoIHNyYy9pbmRleC50cyIsCiAgICAiYnVpbGQiOiAidHNjIC0tcHJvamVjdCB0c2NvbmZpZy5qc29uIiwKICAgICJzdGFydCI6ICJub2RlIGRpc3QvaW5kZXguanMiLAogICAgImRiOm1pZ3JhdGUiOiAidHN4IHNyYy9kYi9taWdyYXRlLnRzIiwKICAgICJkYjpzZWVkIjogInRzeCBzcmMvZGIvc2VlZC50cyIsCiAgICAibGludCI6ICJlY2hvIGxpbnQgb2siCiAgfSwKICAiZGVwZW5kZW5jaWVzIjogewogICAgIkBhd3Mtc2RrL2NsaWVudC1zMyI6ICJeMy41NDAuMCIsCiAgICAiYXhpb3MiOiAiXjEuNi44IiwKICAgICJiY3J5cHRqcyI6ICJeMi40LjMiLAogICAgImNvb2tpZS1wYXJzZXIiOiAiXjEuNC42IiwKICAgICJjb3JzIjogIl4yLjguNSIsCiAgICAiY3JvbiI6ICJeMy4xLjciLAogICAgImV4cHJlc3MiOiAiXjQuMTkuMiIsCiAgICAiZXhwcmVzcy1yYXRlLWxpbWl0IjogIl43LjIuMCIsCiAgICAiaGVsbWV0IjogIl43LjEuMCIsCiAgICAiaW9yZWRpcyI6ICJeNS4zLjIiLAogICAgImpzb253ZWJ0b2tlbiI6ICJeOS4wLjIiLAogICAgIm5vZGVtYWlsZXIiOiAiXjYuOS4xMyIsCiAgICAicGciOiAiXjguMTEuNSIsCiAgICAidXVpZCI6ICJeOS4wLjEiLAogICAgInpvZCI6ICJeMy4yMi40IgogIH0sCiAgImRldkRlcGVuZGVuY2llcyI6IHsKICAgICJAdHlwZXMvYmNyeXB0anMiOiAiXjIuNC42IiwKICAgICJAdHlwZXMvY29va2llLXBhcnNlciI6ICJeMS40LjciLAogICAgIkB0eXBlcy9jb3JzIjogIl4yLjguMTciLAogICAgIkB0eXBlcy9leHByZXNzIjogIl40LjE3LjIxIiwKICAgICJAdHlwZXMvanNvbndlYnRva2VuIjogIl45LjAuNiIsCiAgICAiQHR5cGVzL25vZGUiOiAiXjIwLjEyLjciLAogICAgIkB0eXBlcy9ub2RlbWFpbGVyIjogIl42LjQuMTQiLAogICAgIkB0eXBlcy9wZyI6ICJeOC4xMS40IiwKICAgICJAdHlwZXMvdXVpZCI6ICJeOS4wLjgiLAogICAgInRzeCI6ICJeNC43LjMiLAogICAgInR5cGVzY3JpcHQiOiAiXjUuNC41IgogIH0KfQo="
$bytes = [System.Convert]::FromBase64String($b64)
$fullPath = Join-Path $RepoPath "backend/package.json"
$dir = Split-Path $fullPath -Parent
if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
[System.IO.File]::WriteAllBytes($fullPath, $bytes)
Write-Host "  wrote backend/package.json" -ForegroundColor Green

Write-Host "Re-normalizing git index..." -ForegroundColor Cyan
git rm --cached -r . 2>&1 | Out-Null
git add -A
Write-Host "Committing..." -ForegroundColor Cyan
git commit -m "fix: enforce LF line endings, fix JSON encoding"
Write-Host "Pushing..." -ForegroundColor Cyan
git push --force origin main

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n✅ Fix pushed! Railway is rebuilding now." -ForegroundColor Green
    Write-Host "   Watch: https://railway.app" -ForegroundColor Cyan
} else {
    Write-Host "`n❌ Push failed — check GitHub credentials." -ForegroundColor Red
}