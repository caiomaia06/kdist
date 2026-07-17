import type { Project } from './types'

/**
 * Visualizador de espectro reativo (Web Audio API).
 *
 * - `createElementAnalyser`: conecta um <audio> a um AnalyserNode (preview).
 * - `attachAnalyser`: insere um AnalyserNode em qualquer grafo de áudio
 *   (usado na exportação, entre o AudioBufferSourceNode e o destino).
 * - `drawVisualizer`: desenha as barras pulsantes no canvas com a cor do
 *   membro que está cantando (efeito neon) ou branco neutro no silêncio.
 */

export const FFT_SIZE = 256 // 128 bins de frequência — preciso e barato

export interface AnalyserHandle {
  analyser: AnalyserNode
  /** Buffer reutilizado a cada frame (zero alocação no loop). */
  freq: Uint8Array
}

function makeHandle(ctx: AudioContext): AnalyserHandle {
  const analyser = ctx.createAnalyser()
  analyser.fftSize = FFT_SIZE
  analyser.smoothingTimeConstant = 0.82 // pulso suave, sem tremedeira
  return { analyser, freq: new Uint8Array(analyser.frequencyBinCount) }
}

// createMediaElementSource só pode ser chamado UMA vez por elemento —
// o WeakMap garante reuso mesmo se o src do <audio> mudar.
const elementGraphs = new WeakMap<HTMLAudioElement, { ctx: AudioContext; handle: AnalyserHandle }>()

// AudioContext ÚNICO e compartilhado do preview. Criar um contexto novo a
// cada montagem do player (HMR, trocar de projeto, dashboard → editor)
// esgota o limite de ~6 AudioContexts do navegador — a partir daí o
// analyser falhava em silêncio e o visualizador sumia do canvas.
let sharedCtx: AudioContext | null = null
function getSharedContext(): AudioContext {
  if (!sharedCtx || sharedCtx.state === 'closed') sharedCtx = new AudioContext()
  return sharedCtx
}

/**
 * Conecta o <audio> do preview: elemento → analyser → alto-falantes.
 * Deve ser chamado a partir de um gesto do usuário (ex.: clique em Play).
 * Reutiliza um único AudioContext para a página inteira; cada elemento
 * novo só ganha um MediaElementSource novo dentro do mesmo contexto.
 */
export function createElementAnalyser(audio: HTMLAudioElement): AnalyserHandle {
  let graph = elementGraphs.get(audio)
  if (!graph) {
    const ctx = getSharedContext()
    const handle = makeHandle(ctx)
    const source = ctx.createMediaElementSource(audio)
    source.connect(handle.analyser)
    handle.analyser.connect(ctx.destination) // sem isto o áudio fica mudo
    graph = { ctx, handle }
    elementGraphs.set(audio, graph)
  }
  if (graph.ctx.state === 'suspended') void graph.ctx.resume()
  return graph.handle
}

/**
 * Insere um analyser entre um nó de origem e um destino (exportação).
 * Os dados de frequência são REAIS: o AudioContext do export roda em
 * tempo real, então basta ler o analyser a cada frame gravado.
 */
export function attachAnalyser(ctx: AudioContext, source: AudioNode, dest: AudioNode): AnalyserHandle {
  const handle = makeHandle(ctx)
  source.connect(handle.analyser)
  handle.analyser.connect(dest)
  return handle
}

/** Lê o espectro atual para o buffer do handle e o retorna. */
export function readFrequency(handle: AnalyserHandle): Uint8Array {
  handle.analyser.getByteFrequencyData(handle.freq)
  return handle.freq
}

/** Cor (hex/rgb) com alpha aplicado via globalAlpha — resolve o singer ativo. */
function activeSingerColors(project: Project, t: number): string[] {
  const ids = new Set(
    project.segments
      // Fim estritamente exclusivo (t < endTime), igual ao isActive do renderer
      .filter((s) => t >= s.startTime && t < s.endTime)
      .map((s) => s.memberId),
  )
  return project.members.filter((m) => ids.has(m.id)).map((m) => m.color)
}

const NEUTRAL = 'rgba(255, 255, 255, 0.5)'

/**
 * Barras de espectro espelhadas a partir do centro, ancoradas na base do
 * vídeo. Cor e glow seguem o membro ativo (dividido por zonas quando há
 * mais de um cantor); branco translúcido quando ninguém canta.
 * Desenhado ANTES das barras de ranking, funcionando como camada de fundo.
 */
export function drawVisualizer(
  ctx: CanvasRenderingContext2D,
  project: Project,
  freq: Uint8Array,
  t: number,
  W: number,
  H: number,
): void {
  const colors = activeSingerColors(project, t)
  const horizontal = project.format === 'horizontal'
  // Safe Zone: a onda no volume MÁXIMO nunca toca a barra do último membro.
  // O renderer reserva 110px (16:9) / 120px (9:16) de rodapé abaixo da zona
  // de barras; as ondas ficam sempre 10px+ abaixo desse limite e respeitam
  // o teto de 15% da altura do canvas.
  const reserved = horizontal ? 110 : 120
  const maxBarH = Math.min(horizontal ? 70 : 110, reserved - 10, H * 0.15)
  // Ancorado no exato limite inferior da tela: y = H - alturaDaBarra
  const baseY = H
  const bins = 56 // usa as frequências baixas/médias (onde mora a batida)
  const gap = 4
  const half = W / 2
  const barW = (half - gap * bins) / bins

  ctx.save()
  ctx.globalAlpha = colors.length > 0 ? 0.85 : 0.45
  ctx.lineCap = 'round'

  for (let i = 0; i < bins; i++) {
    const v = (freq[i] ?? 0) / 255
    const h = Math.max(3, v * v * maxBarH) // v² acentua a batida
    // Vários cantores: divide o espectro em zonas, uma cor por cantor
    const color =
      colors.length === 0
        ? NEUTRAL
        : colors[Math.floor((i / bins) * colors.length) % colors.length]

    ctx.fillStyle = color
    if (colors.length > 0 && v > 0.25) {
      ctx.shadowColor = color
      ctx.shadowBlur = 18 * v
    }
    const x = i * (barW + gap)
    // Espelhado: cresce do centro para as bordas
    ctx.beginPath()
    ctx.roundRect(half + x + gap / 2, baseY - h, barW, h, barW / 2)
    ctx.roundRect(half - x - barW - gap / 2, baseY - h, barW, h, barW / 2)
    ctx.fill()
    ctx.shadowBlur = 0
  }

  ctx.restore()
}
