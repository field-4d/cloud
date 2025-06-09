# Start the backend server
Start-Job -ScriptBlock {
    Set-Location backend
    npm run dev
}

# Start the frontend server
Start-Job -ScriptBlock {
    npm run dev
}

# Keep the script running and show output from both servers
while ($true) {
    Get-Job | Receive-Job
    Start-Sleep -Seconds 1
} 