# DiskStation Monitor — Git init and push to existing GitHub repo
# Run with: Set-ExecutionPolicy Bypass -Scope Process -Force; .\PUSH.ps1

$RepoPath  = "C:\Users\LionelMosley\Documents\HTML\Synology - DiskStation Monitor"
$RemoteUrl = "https://github.com/4thandBailey/diskstation-monitor.git"

Set-Location $RepoPath
Write-Host "Working in: $RepoPath" -ForegroundColor Cyan

# Initialize git if not already a repo
if (-not (Test-Path ".git")) {
    Write-Host "Initializing git repo..." -ForegroundColor Yellow
    git init
    git remote add origin $RemoteUrl
} else {
    Write-Host "Git repo already initialized." -ForegroundColor Green
    # Make sure remote is set correctly
    git remote set-url origin $RemoteUrl
}

# Set branch to main
git checkout -b main 2>$null
if ($LASTEXITCODE -ne 0) {
    git checkout main 2>$null
}

# Stage all files
Write-Host "Staging all files..." -ForegroundColor Cyan
git add -A
git status

# Commit
Write-Host "Committing..." -ForegroundColor Cyan
git commit -m "feat: full project scaffold — backend API, poll engine, frontend dashboard"

if ($LASTEXITCODE -ne 0) {
    Write-Host "Nothing new to commit or commit failed." -ForegroundColor Yellow
} else {
    Write-Host "Committed successfully." -ForegroundColor Green
}

# Push — force push since remote only has README
Write-Host "Pushing to GitHub (force)..." -ForegroundColor Cyan
git push --force origin main

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n✅ Pushed to GitHub! Railway will now auto-build." -ForegroundColor Green
    Write-Host "   https://railway.app — check tender-peace → diskstation-monitor" -ForegroundColor Cyan
    Write-Host "`n⚠  Add database plugins in Railway dashboard if not done yet:" -ForegroundColor Yellow
    Write-Host "   tender-peace → + Add → Database → PostgreSQL" -ForegroundColor Yellow
    Write-Host "   tender-peace → + Add → Database → Redis" -ForegroundColor Yellow
} else {
    Write-Host "`n❌ Push failed. You may need to authenticate with GitHub." -ForegroundColor Red
    Write-Host "   Run: git push --force origin main" -ForegroundColor Yellow
    Write-Host "   Then sign in with your GitHub credentials when prompted." -ForegroundColor Yellow
}
