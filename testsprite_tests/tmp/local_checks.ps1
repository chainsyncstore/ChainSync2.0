$ErrorActionPreference = 'SilentlyContinue'

function J {
  param([Parameter(ValueFromPipeline=$true)]$o)
  try { $o | ConvertTo-Json -Depth 8 } catch { $o | Out-String }
}

# 1) Login and keep session
$S = $null
# Prefer test-login in NODE_ENV=test to seed a session quickly
try {
  $login = Invoke-RestMethod -Method Post -Uri http://localhost:5000/api/auth/test-login -SessionVariable S
  "LOGIN_OK"; $login | J
} catch {
  # Fallback to credential login if test-login unavailable
  $loginBody = @{ username = 'admin'; password = 'admin123' } | ConvertTo-Json
  try {
    $login = Invoke-RestMethod -Method Post -Uri http://localhost:5000/api/auth/login -ContentType application/json -Body $loginBody -SessionVariable S
    "LOGIN_OK_FALLBACK"; $login | J
  } catch { "LOGIN_ERROR: $($_.Exception.Message)" }
}

# 2) /api/auth/me
try { $me = Invoke-RestMethod -WebSession $S http://localhost:5000/api/auth/me; "ME_OK"; $me | J } catch { "ME_ERROR: $($_.Exception.Message)" }

# 3) Observability health (may require auth)
try { $obs = Invoke-RestMethod -WebSession $S http://localhost:5000/api/observability/health; "OBS_OK"; $obs | J } catch { "OBS_ERROR: $($_.Exception.Message)" }

# 4) Stores and Inventory
$storeId = $null
try {
  $stores = Invoke-RestMethod -WebSession $S http://localhost:5000/api/stores
  "STORES_OK"; $stores | J
  if ($stores -is [Array]) { if ($stores.Length -gt 0) { $storeId = $stores[0].id } }
  elseif ($stores.id) { $storeId = $stores.id }
} catch { "STORES_ERROR: $($_.Exception.Message)" }

if ($storeId) {
  try { $inv = Invoke-RestMethod -WebSession $S ("http://localhost:5000/api/stores/{0}/inventory" -f $storeId); "INV_OK"; $inv | J } catch { "INV_ERROR: $($_.Exception.Message)" }
} else {
  "NO_STORE_ID"
}

# 5) POS transaction (basic)
if ($storeId) {
  try {
    $posBody = @{ storeId = $storeId; subtotal = 0; taxAmount = 0; totalAmount = 10; status = 'completed'; paymentMethod = 'cash'; notes = 'test' } | ConvertTo-Json
    $tx = Invoke-RestMethod -Method Post -WebSession $S -Uri http://localhost:5000/api/transactions -ContentType application/json -Body $posBody
    "POS_OK"; $tx | J
  } catch { "POS_ERROR: $($_.Exception.Message)" }
}

# 6) Webhook (Flutterwave) - raw endpoint doesn't need session
try {
  $headers = @{ 'x-event-id' = 'evt-local-1'; 'x-event-timestamp' = [string](Get-Date).ToUniversalTime().ToString('o') }
  $whBody = '{"event":"charge.completed","data":{"id":"tx_123","meta":{"orgId":"org_1","planCode":"basic"}}}'
  $wh = Invoke-RestMethod -Method Post -Uri http://localhost:5000/webhooks/flutterwave -Headers $headers -ContentType application/json -Body $whBody
  "WEBHOOK_OK"; $wh | J
} catch { "WEBHOOK_ERROR: $($_.Exception.Message)" }


