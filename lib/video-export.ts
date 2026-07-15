import { attachAnalyser, readFrequency } from './audio-visualizer'
import { loadImage } from './image-utils'
import {
  buildBackgroundCache,
  drawFrame,
  computeTotals,
  videoDims,
  type MemberRenderState,
} from './renderer'
import type { Project } from './types'

export interface ExportResult {
  blob: Blob
  extension: 'mp4' | 'webm'
}

export interface ExportController {
  /** Promise que resolve com o vídeo pronto (ou rejeita se cancelado/erro). */
  done: Promise<ExportResult>
  /** Cancela a exportação imediatamente. */
  cancel: () => void
}

const FPS = 30

/**
 * Pré-rolagem: tempo gravado ANTES da música começar, enquanto o encoder
 * de vídeo e o JIT do navegador "esquentam". Esses frames iniciais — que
 * são justamente os que saem engasgados — são cortados na finalização,
 * então o vídeo final começa perfeitamente estável.
 */
const PREROLL = 1.0

/**
 * Escolhe o melhor formato suportado pelo navegador.
 * MP4 (H.264/AAC) primeiro — é o formato universal para postar em
 * redes sociais. WebM como fallback garantido.
 */
/**
 * O MediaRecorder grava em modo streaming e NÃO escreve a duração nos
 * metadados do arquivo — players tratam como "ao vivo", sem barra de
 * progresso nem seek. Esta etapa remuxa o arquivo (sem re-encodar,
 * apenas reorganiza o container) escrevendo duração e índice de seek.
 */
async function finalizeVideo(
  blob: Blob,
  extension: 'mp4' | 'webm',
  trimStart: number,
  trimEnd: number,
): Promise<Blob> {
  const { Input, Output, Conversion, ALL_FORMATS, BlobSource, BufferTarget, Mp4OutputFormat, WebMOutputFormat } =
    await import('mediabunny')

  const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS })
  const output = new Output({
    format: extension === 'mp4' ? new Mp4OutputFormat() : new WebMOutputFormat(),
    target: new BufferTarget(),
  })
  const conversion = await Conversion.init({
    input,
    output,
    // Corta a pré-rolagem (frames de aquecimento do encoder) do início
    trim: { start: trimStart, end: trimEnd },
  })
  await conversion.execute()
  const buffer = (output.target as InstanceType<typeof BufferTarget>).buffer
  if (!buffer) throw new Error('Remux não produziu dados')
  return new Blob([buffer], { type: extension === 'mp4' ? 'video/mp4' : 'video/webm' })
}

function pickMimeType(): { mime: string; extension: 'mp4' | 'webm' } {
  const candidates: Array<{ mime: string; extension: 'mp4' | 'webm' }> = [
    { mime: 'video/mp4;codecs=avc1.42E01E,mp4a.40.2', extension: 'mp4' },
    { mime: 'video/mp4', extension: 'mp4' },
    { mime: 'video/webm;codecs=vp9,opus', extension: 'webm' },
    { mime: 'video/webm;codecs=vp8,opus', extension: 'webm' },
    { mime: 'video/webm', extension: 'webm' },
  ]
  for (const c of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(c.mime)) {
      return c
    }
  }
  return { mime: '', extension: 'webm' }
}

/**
 * Motor de exportação isolado e estável:
 *
 * 1. Canvas OFFSCREEN dedicado — nada do React ou da UI interfere.
 * 2. Áudio decodificado em AudioBuffer e tocado por AudioBufferSourceNode
 *    direto no MediaStreamDestination (silencioso, sem elemento <audio>).
 *    O relógio do AudioContext é a única fonte de tempo: áudio e vídeo
 *    ficam perfeitamente sincronizados, sem drift.
 * 3. captureStream(0) + requestFrame(): cada frame só entra no vídeo
 *    depois de totalmente desenhado — nunca captura frame pela metade.
 * 4. Bitrate alto (12 Mbps) para qualidade de postagem em 1080x1920.
 */
export function startVideoExport(
  project: Project,
  audioUrl: string,
  duration: number,
  onProgress: (p: number) => void,
  onFrame?: (canvas: HTMLCanvasElement) => void,
): ExportController {
  let cancelled = false
  let cleanupFns: Array<() => void> = []

  const cancel = () => {
    cancelled = true
  }

  const done = (async (): Promise<ExportResult> => {
    // ---------- 1. Preparar todos os assets ANTES de gravar ----------
    const [audioData, cover, avatarEntries] = await Promise.all([
      fetch(audioUrl).then((r) => r.arrayBuffer()),
      project.coverImage ? loadImage(project.coverImage).catch(() => null) : Promise.resolve(null),
      Promise.all(
        project.members
          .filter((m) => m.avatar)
          .map(async (m) => {
            const img = await loadImage(m.avatar!).catch(() => null)
            return [m.id, img] as const
          }),
      ),
    ])
    if (cancelled) throw new Error('cancelled')

    const avatars = new Map<string, HTMLImageElement>()
    for (const [id, img] of avatarEntries) if (img) avatars.set(id, img)

    // Garante que a fonte usada no canvas já está carregada
    await document.fonts.ready.catch(() => {})

    const actx = new AudioContext()
    cleanupFns.push(() => void actx.close().catch(() => {}))
    const audioBuffer = await actx.decodeAudioData(audioData)
    if (cancelled) throw new Error('cancelled')

    const total = Math.min(duration, audioBuffer.duration)

    // ---------- 2. Canvas offscreen + cache de fundo ----------
    const canvas = document.createElement('canvas')
    const dims = videoDims(project.format)
    canvas.width = dims.W
    canvas.height = dims.H
    const ctx = canvas.getContext('2d')!
    const cache = buildBackgroundCache(project, cover)
    const totals = computeTotals(project)
    const states = new Map<string, MemberRenderState>()

    // ---------- 3. Streams ----------
    const dest = actx.createMediaStreamDestination()
    const source = actx.createBufferSource()
    source.buffer = audioBuffer
    // Roteia pelo analyser: source → analyser → dest. O AudioContext do
    // export roda em tempo real, então o visualizador usa dados REAIS de
    // frequência também no vídeo final (sem fake bounce).
    const analyserHandle = attachAnalyser(actx, source, dest)

    const videoStream = canvas.captureStream(0)
    const videoTrack = videoStream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack
    const stream = new MediaStream([videoTrack, ...dest.stream.getAudioTracks()])
    cleanupFns.push(() => stream.getTracks().forEach((t) => t.stop()))

    const { mime, extension } = pickMimeType()
    const recorder = new MediaRecorder(stream, {
      ...(mime ? { mimeType: mime } : {}),
      videoBitsPerSecond: 12_000_000,
      audioBitsPerSecond: 192_000,
    })

    const chunks: Blob[] = []
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data)
    }

    const recorderStopped = new Promise<void>((resolve) => {
      recorder.onstop = () => resolve()
    })

    // ---------- 4a. Aquecimento ANTES de gravar ----------
    // Desenha vários frames descartados para o JIT compilar os caminhos
    // quentes de desenho e o canvas alocar buffers — tudo fora do vídeo.
    for (let i = 0; i < 15; i++) {
      drawFrame(ctx, cache, project, avatars, states, totals, (i * 0.2) % Math.max(total, 1), total)
    }
    states.clear()
    drawFrame(ctx, cache, project, avatars, states, totals, 0, total)

    // ---------- 4b. Gravação com relógio do AudioContext ----------
    await actx.resume()
    recorder.start(500)
    const t0 = actx.currentTime

    // Pré-rolagem: o encoder estabiliza gravando o frame inicial parado.
    // A música só começa depois — e esse trecho é cortado na finalização.
    source.start(t0 + PREROLL)
    videoTrack.requestFrame()

    await new Promise<void>((resolve) => {
      const interval = setInterval(() => {
        try {
          const elapsed = actx.currentTime - t0
          const t = elapsed - PREROLL // tempo da música (negativo na pré-rolagem)
          if (cancelled || t >= total) {
            clearInterval(interval)
            resolve()
            return
          }
          drawFrame(
            ctx,
            cache,
            project,
            avatars,
            states,
            totals,
            Math.max(0, t),
            total,
            t >= 0 ? readFrequency(analyserHandle) : undefined,
          )
          videoTrack.requestFrame()
          onFrame?.(canvas)
          onProgress(Math.min(1, Math.max(0, t) / total))
        } catch {
          // Um frame com erro nunca derruba a gravação inteira
        }
      }, 1000 / FPS)
      cleanupFns.push(() => clearInterval(interval))
    })

    // ---------- 5. Finalização ----------
    try {
      source.stop()
    } catch {}
    if (recorder.state !== 'inactive') recorder.stop()
    await recorderStopped

    for (const fn of cleanupFns) fn()
    cleanupFns = []

    if (cancelled) throw new Error('cancelled')
    if (chunks.length === 0) throw new Error('Nenhum dado gravado')

    // ---------- 6. Finalização: corta a pré-rolagem + grava duração/seek ----------
    const rawBlob = new Blob(chunks, { type: mime || 'video/webm' })
    let finalBlob = rawBlob
    try {
      finalBlob = await finalizeVideo(rawBlob, extension, PREROLL, PREROLL + total)
    } catch (e) {
      // Se o remux falhar, ainda entrega o vídeo original (reproduzível)
      console.error('Falha ao finalizar metadados do vídeo', e)
    }

    onProgress(1)
    return {
      blob: finalBlob,
      extension,
    }
  })()

  // Garantia extra de limpeza em erro
  done.catch(() => {
    for (const fn of cleanupFns) fn()
    cleanupFns = []
  })

  return { done, cancel }
}

/** Dispara o download do vídeo no dispositivo do usuário. */
export function downloadVideo(result: ExportResult, title: string): void {
  const url = URL.createObjectURL(result.blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${(title || 'line-distribution').replace(/[\\/:*?"<>|]/g, '_')}.${result.extension}`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
