# Laboratorio 8, paso 8: compara el Client Secret anterior y el nuevo contra el token endpoint de Auth0.
# Pide los dos valores con entrada oculta; no los escribe en pantalla, en archivos ni en el historial.
# Solo muestra la hora, el estado HTTP y el campo "error" de cada intento.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\comparar-secretos.ps1
#
# Esperado: secreto anterior => invalid_client; secreto nuevo => invalid_grant
# (Auth0 acepta la credencial y rechaza el codigo de prueba).
param(
  [string]$Dominio = 'dev-kzksmpcmr6ggkro3.us.auth0.com',
  [string]$ClientId = 'qwSVQokzV49XfqmgXrHVV5CqbjHgiiY8',
  [string]$RedirectUri = 'https://infosec-unachat-2026-x8p9.onrender.com/auth/callback'
)

Add-Type -AssemblyName System.Net.Http

function Leer-Secreto([string]$nombre) {
  $seguro = Read-Host -Prompt "Pegue el secreto $nombre y pulse Enter (no se muestra)" -AsSecureString
  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($seguro)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
}

function Probar([string]$etiqueta, [string]$secreto) {
  # cadena de prueba de 43 caracteres permitidos para code_verifier
  $verificador = -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 43 | ForEach-Object { [char]$_ })
  $campos = New-Object 'System.Collections.Generic.Dictionary[string,string]'
  $campos.Add('grant_type', 'authorization_code')
  $campos.Add('client_id', $ClientId)
  $campos.Add('client_secret', $secreto)
  $campos.Add('code', 'vault-startup-probe')
  $campos.Add('redirect_uri', $RedirectUri)
  $campos.Add('code_verifier', $verificador)

  $contenido = New-Object System.Net.Http.FormUrlEncodedContent($campos)
  $cliente = New-Object System.Net.Http.HttpClient
  $hora = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
  try {
    $respuesta = $cliente.PostAsync("https://$Dominio/oauth/token", $contenido).GetAwaiter().GetResult()
    $texto = $respuesta.Content.ReadAsStringAsync().GetAwaiter().GetResult()
    $estado = [int]$respuesta.StatusCode
    $codigoError = ''
    try { $codigoError = [string](($texto | ConvertFrom-Json).error) } catch { $codigoError = '(sin JSON)' }
  } finally {
    $cliente.Dispose()
  }
  return [pscustomobject]@{ Hora = $hora; Intento = $etiqueta; HTTP = $estado; Error = $codigoError }
}

$anterior = Leer-Secreto 'ANTERIOR (el que se rotó)'
$nuevo = Leer-Secreto 'NUEVO'

$resultados = @(
  (Probar 'secreto anterior' $anterior),
  (Probar 'secreto nuevo' $nuevo)
)
$anterior = $null
$nuevo = $null

$resultados | Format-Table -AutoSize
