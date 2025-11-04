$report = Get-Content -Path 'eslint-report.json' -Raw | ConvertFrom-Json
$summary = @()
foreach ($item in $report) {
  if (-not $item.messages) {
    continue
  }

  $errors = ($item.messages | Where-Object { $_.severity -eq 2 }).Count
  $warnings = ($item.messages | Where-Object { $_.severity -eq 1 }).Count

  if ($errors -gt 0 -or $warnings -gt 0) {
    $summary += [PSCustomObject]@{
      File = $item.filePath
      Errors = $errors
      Warnings = $warnings
    }
  }
}

$summary | Sort-Object -Property @{
  Expression = 'Errors'
  Descending = $true
}, @{
  Expression = 'Warnings'
  Descending = $true
} | ForEach-Object {
  "{0}`tErrors:{1}`tWarnings:{2}" -f $_.File, $_.Errors, $_.Warnings
}
