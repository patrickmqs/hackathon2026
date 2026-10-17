# Benchmark de modelos de transcrição

Comparação feita em 2026-10-17 com a chave do time, no áudio `sample_data/sample_meeting.mp3` (voz sintética, 4 vozes, 625 s, texto-verdade de 1438 palavras em `sample_transcript_pt.txt`). Reproduzir: `npm run bench:transcribe -- ../sample_data/sample_meeting.mp3 <pasta>` em `scripts/`.

WER = taxa de erro de palavras contra o texto original (minúsculas, sem acento e sem pontuação). Menor é melhor.

| Modelo | WER run 1 | WER run 2 | Tempo (10 min de áudio) | Segmentos com tempo | Falantes |
|---|---|---|---|---|---|
| **`gpt-4o-transcribe`** | **1,1%** | **0,8%** | 26–27 s | não | não |
| `gpt-4o-mini-transcribe` | 1,8% | 2,2% | 14–15 s | não | não |
| `gpt-transcribe` | 2,2% | 2,2% | 12–14 s | não | não |
| `whisper-1` | 2,4% | 2,4% | 31–32 s | sim (135) | não |
| `gpt-4o-transcribe-diarize` | 4,7% | 4,6% | 269–276 s | sim (268–271) | sim, anônimos (A, B, C) |

Dados brutos: `run1/` (saídas completas de cada modelo) e `run2/` (saídas + `results.json`).

## Decisão: `gpt-4o-transcribe` (`OPENAI_TRANSCRIBE_MODEL`)
- **Menor erro nas duas execuções** (0,8–1,1%), cerca de metade do `whisper-1` e dos modelos mais leves, e o resultado foi estável entre as rodadas.
- Latência aceitável: ~27 s para 10 min de áudio, bem abaixo do limite de 90 s do pipeline.
- Qualidade do texto importa mais aqui do que em outros casos: toda citação (`quote`) da análise precisa existir literalmente na transcrição.

**Custo da escolha:** o modelo devolve só texto, sem segmentos nem tempo. Consequências: `segments = []`, `has_timestamps = false`, e o "ver na transcrição" destaca o trecho citado sem mostrar `mm:ss` nem saltar por tempo (já previsto em UX_FLOW: "se houver timestamp"). O serviço de transcrição divide o texto em segmentos por frase, com `start_ms`/`end_ms` nulos.

**Alternativa configurável:** `OPENAI_TRANSCRIBE_MODEL=whisper-1` devolve segmentos com tempo, com erro ~2× maior. Use se a demonstração precisar de timestamps.

## Por que os outros ficaram de fora
- `gpt-4o-transcribe-diarize`: o pior erro (4,6–4,7%), ~10× mais lento (≈0,45× do tempo real; 4,5 min para 10 min de áudio) e identificou 3 falantes em vez de 4, com rótulos anônimos (A, B, C) que ainda exigiriam o LLM para virar nomes. Só vale a pena para reuniões reais em segundo plano, quando quem fala for crítico.
- `gpt-4o-mini-transcribe` e `gpt-transcribe`: mais rápidos (12–15 s), mas com erro ~2× maior que o escolhido, sem tempo e sem falantes.
- `whisper-1`: único com segmentos e tempo, mas o texto tem o dobro de erros.

## Limites deste teste
- Áudio **sintético e limpo**: sem ruído, sobreposição de falas nem sotaques. Os WER reais serão maiores e a ordem entre modelos pode mudar. Repetir com uma gravação real do time antes de dar a escolha como definitiva.
- Duas rodadas, um único áudio. Custo em dinheiro não foi medido (só o uso de tokens do `diarize`: 12.983 de entrada, sendo 11.971 de áudio, e 19.652 de saída).
