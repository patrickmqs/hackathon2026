# Gera áudios de teste (WAV) a partir de roteiros "Nome: fala" usando a voz pt-BR do Windows (grátis, offline).
# Cada interlocutor ganha um tom diferente da mesma voz. Uso:
#   powershell -File scripts/gerar-audios-teste.ps1 [-Pasta sample_data/test_meetings]
param([string]$Pasta = "sample_data/test_meetings")

Add-Type -AssemblyName System.Speech
$pitches = @("x-low", "high", "low", "medium", "x-high")   # um por interlocutor, na ordem em que aparecem
$format = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(16000, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)

foreach ($roteiro in Get-ChildItem $Pasta -Filter *.txt) {
  $tmp = Join-Path ([System.IO.Path]::GetTempPath()) ("tts_" + [guid]::NewGuid().ToString("N"))
  New-Item -ItemType Directory $tmp | Out-Null
  $voz = New-Object System.Speech.Synthesis.SpeechSynthesizer
  $voz.SelectVoice("Microsoft Maria Desktop")
  $falantes = @{}
  $pcm = New-Object System.IO.MemoryStream
  $silencio = New-Object byte[] (16000 * 2 * 0.4)   # 0,4 s entre falas
  $n = 0
  foreach ($linha in Get-Content $roteiro.FullName -Encoding UTF8) {
    if ($linha -notmatch '^([^:]+):\s*(.+)$') { continue }
    $nome = $Matches[1].Trim(); $texto = [System.Security.SecurityElement]::Escape($Matches[2])
    if (-not $falantes.ContainsKey($nome)) { $falantes[$nome] = $falantes.Count }
    $i = $falantes[$nome] % $pitches.Count
    $arquivo = Join-Path $tmp ("{0:D3}.wav" -f $n++)
    $voz.SetOutputToWaveFile($arquivo, $format)
    $voz.SpeakSsml("<speak version='1.0' xml:lang='pt-BR' xmlns='http://www.w3.org/2001/10/synthesis'><prosody pitch='$($pitches[$i])'>$texto</prosody></speak>")
    $voz.SetOutputToNull()
    $bytes = [System.IO.File]::ReadAllBytes($arquivo)
    $pcm.Write($bytes, 44, $bytes.Length - 44)   # pula o cabeçalho de 44 bytes
    $pcm.Write($silencio, 0, $silencio.Length)
  }
  $voz.Dispose()
  $saida = [System.IO.Path]::ChangeExtension($roteiro.FullName, ".wav")
  $fs = [System.IO.File]::Create($saida)
  $bw = New-Object System.IO.BinaryWriter($fs)
  $dados = $pcm.ToArray()
  $bw.Write([System.Text.Encoding]::ASCII.GetBytes("RIFF")); $bw.Write([int](36 + $dados.Length))
  $bw.Write([System.Text.Encoding]::ASCII.GetBytes("WAVEfmt ")); $bw.Write([int]16); $bw.Write([int16]1); $bw.Write([int16]1)
  $bw.Write([int]16000); $bw.Write([int]32000); $bw.Write([int16]2); $bw.Write([int16]16)
  $bw.Write([System.Text.Encoding]::ASCII.GetBytes("data")); $bw.Write([int]$dados.Length); $bw.Write($dados)
  $bw.Close(); $fs.Close()
  Remove-Item $tmp -Recurse -Force
  "{0}: {1:N1} min, {2:N1} MB" -f ([System.IO.Path]::GetFileName($saida)), ($dados.Length / 32000 / 60), ((Get-Item $saida).Length / 1MB)
}
