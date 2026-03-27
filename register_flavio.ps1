$payload = @{
    email = "flaviolimatkds1230@gmail.com"
    password = "12345678"
    returnSecureToken = $true
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=AIzaSyBtINyPi1K6Fo3r1XrgdzK4j7wpiJ77i1c" -Method Post -Body $payload -ContentType "application/json"
    Write-Host "SUCCESS: User created."
    Write-Host "Email: $($response.email)"
    Write-Host "LocalId (UID): $($response.localId)"
} catch {
    $err = $_.Exception.Response.GetResponseStream()
    $reader = New-Object System.IO.StreamReader($err)
    $responseBody = $reader.ReadToEnd()
    Write-Host "ERROR: $($responseBody)"
    exit 1
}
