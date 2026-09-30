Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$synth.Rate = 0
$destDir = Join-Path $PSScriptRoot "..\..\frontend\assets"
if (!(Test-Path $destDir)) {
    New-Item -ItemType Directory -Path $destDir -Force | Out-Null
}
$filePath = Join-Path $destDir "emergency_voice.wav"
$synth.SetOutputToWaveFile($filePath)
$synth.Speak("It's an emergency, I need help.")
$synth.Dispose()
Write-Host "Voice generated successfully at: $filePath"
(Get-Item $filePath).Length
