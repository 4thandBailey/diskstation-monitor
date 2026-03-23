# Run migrations on startup patch
# Run: Set-ExecutionPolicy Bypass -Scope Process -Force; .\MIGRATE.ps1

$RepoPath = "C:\Users\LionelMosley\Documents\HTML\Synology - DiskStation Monitor"
Set-Location $RepoPath
Write-Host "Adding prestart migration hook..." -ForegroundColor Cyan

$b64 = "ewogICJuYW1lIjogImRpc2tzdGF0aW9uLW1vbml0b3IiLAogICJ2ZXJzaW9uIjogIjEuMC4wIiwKICAicHJpdmF0ZSI6IHRydWUsCiAgImRlc2NyaXB0aW9uIjogIlJlYWwtdGltZSBmbGVldCBtb25pdG9yaW5nIGZvciBTeW5vbG9neSBOQVMgYXBwbGlhbmNlcyIsCiAgIndvcmtzcGFjZXMiOiBbCiAgICAiZnJvbnRlbmQiLAogICAgImJhY2tlbmQiCiAgXSwKICAic2NyaXB0cyI6IHsKICAgICJkZXYiOiAiY29uY3VycmVudGx5IFwibnBtIHJ1biBkZXYgLS13b3Jrc3BhY2U9YmFja2VuZFwiIFwibnBtIHJ1biBkZXYgLS13b3Jrc3BhY2U9ZnJvbnRlbmRcIiIsCiAgICAiYnVpbGQiOiAibnBtIHJ1biBidWlsZCAtLXdvcmtzcGFjZT1iYWNrZW5kIiwKICAgICJwcmVzdGFydCI6ICJub2RlIGJhY2tlbmQvZGlzdC9kYi9taWdyYXRlLmpzIiwKICAgICJzdGFydCI6ICJub2RlIGJhY2tlbmQvZGlzdC9pbmRleC5qcyIsCiAgICAiZGI6bWlncmF0ZSI6ICJucG0gcnVuIGRiOm1pZ3JhdGUgLS13b3Jrc3BhY2U9YmFja2VuZCIsCiAgICAiZGI6c2VlZCI6ICJucG0gcnVuIGRiOnNlZWQgLS13b3Jrc3BhY2U9YmFja2VuZCIKICB9LAogICJkZXZEZXBlbmRlbmNpZXMiOiB7CiAgICAiY29uY3VycmVudGx5IjogIl44LjIuMiIKICB9LAogICJlbmdpbmVzIjogewogICAgIm5vZGUiOiAiPj0yMC4wLjAiCiAgfQp9Cg=="
$bytes = [System.Convert]::FromBase64String($b64)
$fullPath = Join-Path $RepoPath "package.json"
[System.IO.File]::WriteAllBytes($fullPath, $bytes)
Write-Host "  updated package.json with prestart migration" -ForegroundColor Green

git add package.json
git commit -m "fix: run DB migrations automatically on startup via prestart"
git push origin main

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n✅ Pushed! Railway will rebuild and run migrations on next start." -ForegroundColor Green
} else {
    Write-Host "`n❌ Push failed." -ForegroundColor Red
}