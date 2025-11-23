# start-dev.ps1
# Charge les variables du fichier .env et lance le serveur en local

# Vérifie que le fichier .env existe
if (-not (Test-Path ".env")) {
    Write-Host "Fichier .env introuvable. Crée-le à la racine du projet." -ForegroundColor Red
    exit 1
}

# Charge chaque ligne de type NOM=VALEUR
Get-Content .env | ForEach-Object {
    if ($_ -match "^\s*([^#=]+)\s*=\s*(.*)\s*$") {
        $name  = $matches[1].Trim()
        $value = $matches[2].Trim()
        # Définit la variable d'environnement pour ce process (héritée par node)
        [System.Environment]::SetEnvironmentVariable($name, $value)
    }
}

Write-Host "Variables d'environnement chargées depuis .env" -ForegroundColor Green
Write-Host "Démarrage du serveur Node..." -ForegroundColor Cyan

node server.js

