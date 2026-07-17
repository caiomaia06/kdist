import { drawVisualizer } from './audio-visualizer'
import {
  computeLastEndTimes,
  desaturateColor,
  drawLeftChatToasts,
  drawOffBadge,
  grayscaleImage,
  hasLeftChat,
} from './left-chat'
import type { Project, VideoFormat } from './types'

export const VIDEO_W = 1080
export const VIDEO_H = 1920

/** Dimensões do vídeo conforme o formato do projeto. */
export function videoDims(format?: VideoFormat): { W: number; H: number } {
  return format === 'horizontal' ? { W: 1920, H: 1080 } : { W: 1080, H: 1920 }
}

/** Duração da tela de Ranking Final no fim do áudio (segundos). */
export const FINAL_RANKING_SECS = 5

/** Duração das telas cinematográficas de entrada e saída (segundos). */
export const INTRO_SECS = 3
export const OUTRO_SECS = 3
export const DEFAULT_OUTRO_TEXT = 'Thanks for watching!'

/** Estados da máquina de renderização do vídeo. */
export type VideoState = 'INTRO' | 'MAIN' | 'RANKING' | 'OUTRO'

export interface VideoTiming {
  introDur: number // 0 ou INTRO_SECS
  outroDur: number // 0 ou OUTRO_SECS
  audioDur: number // duração do áudio (fase MAIN + RANKING)
  totalDur: number // duração total do vídeo exportado
}

/**
 * Linha do tempo do VÍDEO (não do áudio):
 *   [INTRO 0..introDur] [MAIN/RANKING introDur..introDur+audioDur] [OUTRO ...totalDur]
 * O áudio sofre delay de introDur para começar a tocar.
 */
export function videoTiming(project: Project, audioDur: number): VideoTiming {
  const introDur = project.introEnabled ? INTRO_SECS : 0
  const outroDur = project.outroEnabled ? OUTRO_SECS : 0
  return { introDur, outroDur, audioDur, totalDur: audioDur + introDur + outroDur }
}

/** Estado atual da máquina para um tempo de VÍDEO vt. */
export function videoStateAt(project: Project, vt: number, audioDur: number): VideoState {
  const { introDur, outroDur } = videoTiming(project, audioDur)
  if (vt < introDur) return 'INTRO'
  if (outroDur > 0 && vt >= introDur + audioDur) return 'OUTRO'
  // RANKING é um sub-estado do fim do áudio, resolvido dentro do drawFrame
  return 'MAIN'
}

/** Converte tempo de vídeo → tempo de áudio (clampado à duração da música). */
export function videoToAudioTime(project: Project, vt: number, audioDur: number): number {
  const { introDur } = videoTiming(project, audioDur)
  return Math.max(0, Math.min(audioDur, vt - introDur))
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

/** Estado animado (suavizado) de cada membro entre frames. */
export interface MemberRenderState {
  y: number
  barW: number
  glow: number
  initialized: boolean
}

// ---------- Layout do cabeçalho por formato ----------

interface HeaderLayout {
  coverSize: number
  coverCy: number
  labelY: number
  titleY: number
  artistY: number
  headerEndY: number
  titleFont: number
}

function headerLayout(project: Project): HeaderLayout {
  const horizontal = project.format === 'horizontal'
  const hasCover = !!project.coverImage
  if (horizontal) {
    return hasCover
      ? { coverSize: 110, coverCy: 100, labelY: 192, titleY: 252, artistY: 302, headerEndY: 315, titleFont: 54 }
      : { coverSize: 0, coverCy: 0, labelY: 84, titleY: 152, artistY: 206, headerEndY: 220, titleFont: 54 }
  }
  return hasCover
    ? { coverSize: 140, coverCy: 190, labelY: 320, titleY: 400, artistY: 460, headerEndY: 470, titleFont: 68 }
    : { coverSize: 0, coverCy: 0, labelY: 200, titleY: 280, artistY: 340, headerEndY: 350, titleFont: 68 }
}

function hasAnyLyric(project: Project): boolean {
  return project.segments.some(
    (s) => s.lyric?.trim() || s.lyricHangul?.trim() || s.lyricRomanized?.trim() || s.lyricTranslation?.trim(),
  )
}

/** Y onde começa a zona das barras. */
function barsTop(project: Project): number {
  const lyrics = hasAnyLyric(project)
  if (project.format === 'horizontal') {
    return headerLayout(project).headerEndY + (lyrics ? 400 : 260)
  }
  return project.coverImage ? (lyrics ? 790 : 700) : (lyrics ? 670 : 580)
}

/**
 * Cache offscreen do fundo: capa com blur pesado + overlay escuro + capa
 * nítida pequena. Desenhado UMA única vez — o loop principal apenas faz
 * ctx.drawImage(cache, 0, 0). Nunca use ctx.filter dentro do loop.
 * (O título/artista NÃO ficam no cache: são animados por frame.)
 */
export function buildBackgroundCache(
  project: Project,
  coverImg: HTMLImageElement | null,
): HTMLCanvasElement {
  const { W, H } = videoDims(project.format)
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!

  if (coverImg) {
    // Capa esticada em cover, com blur pesado (apenas aqui, fora do loop)
    const scale = Math.max(W / coverImg.width, H / coverImg.height) * 1.2
    const w = coverImg.width * scale
    const h = coverImg.height * scale
    ctx.filter = 'blur(60px)'
    ctx.drawImage(coverImg, (W - w) / 2, (H - h) / 2, w, h)
    ctx.filter = 'none'
  } else {
    const grad = ctx.createLinearGradient(0, 0, 0, H)
    grad.addColorStop(0, '#16121f')
    grad.addColorStop(1, '#0a0810')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, W, H)
  }

  // Overlay escuro para contraste
  ctx.fillStyle = 'rgba(6, 5, 12, 0.72)'
  ctx.fillRect(0, 0, W, H)

  // Capa nítida pequena no topo (se existir)
  if (coverImg) {
    const { coverSize, coverCy } = headerLayout(project)
    const cx = W / 2
    ctx.save()
    ctx.beginPath()
    ctx.roundRect(cx - coverSize / 2, coverCy - coverSize / 2, coverSize, coverSize, 24)
    ctx.clip()
    ctx.drawImage(coverImg, cx - coverSize / 2, coverCy - coverSize / 2, coverSize, coverSize)
    ctx.restore()
    ctx.strokeStyle = 'rgba(255,255,255,0.25)'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.roundRect(cx - coverSize / 2, coverCy - coverSize / 2, coverSize, coverSize, 24)
    ctx.stroke()
  }

  return canvas
}

/** Tempo acumulado cantado por cada membro até o instante t. */
export function computeSungTimes(project: Project, t: number): Map<string, number> {
  const sung = new Map<string, number>()
  for (const m of project.members) sung.set(m.id, 0)
  for (const seg of project.segments) {
    const dur = Math.max(0, Math.min(t, seg.endTime) - seg.startTime)
    if (dur > 0) sung.set(seg.memberId, (sung.get(seg.memberId) ?? 0) + dur)
  }
  return sung
}

/** Total absoluto por membro na música INTEIRA (para o máximo da barra). */
export function computeTotals(project: Project): Map<string, number> {
  const totals = new Map<string, number>()
  for (const m of project.members) totals.set(m.id, 0)
  for (const seg of project.segments) {
    const dur = Math.max(0, seg.endTime - seg.startTime)
    totals.set(seg.memberId, (totals.get(seg.memberId) ?? 0) + dur)
  }
  return totals
}

function isActive(project: Project, memberId: string, t: number): boolean {
  // Fim estritamente exclusivo (t < endTime): se A termina em 5.0s e B começa
  // em 5.0s, no instante 5.0 só B está ativo — sem colisão de milissegundos.
  return project.segments.some(
    (s) => s.memberId === memberId && t >= s.startTime && t < s.endTime,
  )
}

function easeOutCubic(x: number): number {
  return 1 - Math.pow(1 - x, 3)
}

/**
 * Título/artista com animação de entrada (slide-up + fade nos primeiros
 * instantes) e tipografia display (Unbounded) estilo K-pop edit.
 */
function drawHeaderText(ctx: CanvasRenderingContext2D, project: Project, t: number, W: number): void {
  const hl = headerLayout(project)
  const p = easeOutCubic(Math.min(1, t / 1.1)) // 0→1 em 1.1s
  const rise = (1 - p) * 46

  ctx.save()
  ctx.textAlign = 'center'

  // Rótulo com tracking largo
  ctx.globalAlpha = Math.min(1, p * 1.2) * 0.55
  ctx.fillStyle = '#ffffff'
  ctx.font = '600 26px Unbounded, Outfit, sans-serif'
  ctx.fillText('L I N E   D I S T R I B U T I O N', W / 2, hl.labelY + rise * 0.5)

  // Título em fonte display com glow rosa sutil
  ctx.globalAlpha = p
  ctx.shadowColor = 'rgba(236, 72, 153, 0.55)'
  ctx.shadowBlur = 30 * p
  ctx.fillStyle = '#ffffff'
  ctx.font = `800 ${hl.titleFont}px Unbounded, Outfit, sans-serif`
  ctx.fillText(project.title || 'Sem título', W / 2, hl.titleY + rise, W - 120)
  ctx.shadowBlur = 0

  // Artista
  ctx.globalAlpha = p * 0.7
  ctx.font = '500 38px Outfit, sans-serif'
  ctx.fillText(project.artist || '', W / 2, hl.artistY + rise, W - 160)

  ctx.restore()
  ctx.textAlign = 'left'
}

/**
 * Entry-point da máquina de estados do vídeo: recebe o tempo de VÍDEO
 * (vt) e despacha para INTRO / MAIN+RANKING / OUTRO. O drawFrame original
 * permanece intacto — continua recebendo tempo de ÁUDIO, preservando toda a
 * sincronia existente (barras, letras, ranking, visualizador).
 */
export function drawVideoFrame(
  ctx: CanvasRenderingContext2D,
  cache: HTMLCanvasElement,
  project: Project,
  avatars: Map<string, HTMLImageElement>,
  states: Map<string, MemberRenderState>,
  totals: Map<string, number>,
  vt: number,
  audioDur: number,
  freq?: Uint8Array,
): void {
  const { W, H } = videoDims(project.format)
  const state = videoStateAt(project, vt, audioDur)
  const { introDur } = videoTiming(project, audioDur)

  if (state === 'INTRO') {
    drawIntroScreen(ctx, project, vt, W, H)
    return
  }
  if (state === 'OUTRO') {
    drawOutroScreen(ctx, project, vt - introDur - audioDur, W, H)
    return
  }
  // MAIN (e RANKING, resolvido internamente pelo drawFrame)
  drawFrame(ctx, cache, project, avatars, states, totals, vt - introDur, audioDur, freq)
}

/**
 * Tela de INTRO (0..INTRO_SECS): fundo escuro, nome do grupo (menor) e
 * título da música (maior, negrito) centralizados. Fade in no primeiro
 * segundo, fade out no último.
 */
function drawIntroScreen(
  ctx: CanvasRenderingContext2D,
  project: Project,
  t: number,
  W: number,
  H: number,
): void {
  // Fundo totalmente escuro (mesma paleta do fundo do projeto)
  const grad = ctx.createLinearGradient(0, 0, 0, H)
  grad.addColorStop(0, '#100c18')
  grad.addColorStop(1, '#07050c')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, W, H)

  // Fade in (1º segundo) e fade out (último segundo)
  const fadeIn = easeOutCubic(Math.min(1, t / 1))
  const fadeOut = Math.min(1, Math.max(0, (INTRO_SECS - t) / 1))
  const a = Math.min(fadeIn, fadeOut)
  const rise = (1 - fadeIn) * 30 // leve slide-up na entrada

  ctx.save()
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  const horizontal = project.format === 'horizontal'
  const cy = H / 2

  // Nome do grupo (fonte menor, tracking largo)
  ctx.globalAlpha = a * 0.7
  ctx.fillStyle = '#ffffff'
  ctx.font = `600 ${horizontal ? 34 : 40}px Outfit, sans-serif`
  ctx.fillText((project.artist || '').toUpperCase(), W / 2, cy - (horizontal ? 64 : 80) + rise, W - 160)

  // Título da música (fonte maior, negrito, glow rosa)
  ctx.globalAlpha = a
  ctx.shadowColor = 'rgba(236, 72, 153, 0.55)'
  ctx.shadowBlur = 34 * a
  ctx.font = `800 ${horizontal ? 72 : 84}px Unbounded, Outfit, sans-serif`
  ctx.fillText(project.title || 'Sem título', W / 2, cy + (horizontal ? 16 : 20) + rise, W - 140)
  ctx.shadowBlur = 0

  // Linha decorativa sutil abaixo do título
  ctx.globalAlpha = a * 0.35
  ctx.fillStyle = '#ec4899'
  const lineW = 120 * fadeIn
  ctx.fillRect(W / 2 - lineW / 2, cy + (horizontal ? 90 : 110), lineW, 4)

  ctx.restore()
  ctx.globalAlpha = 1
}

/**
 * Tela de OUTRO (últimos OUTRO_SECS): fade do ranking para tela escura com
 * o texto de encerramento centralizado, com transição suave nas duas pontas.
 */
function drawOutroScreen(
  ctx: CanvasRenderingContext2D,
  project: Project,
  t: number, // 0..OUTRO_SECS dentro do outro
  W: number,
  H: number,
): void {
  // Fade para escuro: overlay cresce no primeiro 0.8s (transição do ranking)
  const darken = easeOutCubic(Math.min(1, t / 0.8))
  const grad = ctx.createLinearGradient(0, 0, 0, H)
  grad.addColorStop(0, '#100c18')
  grad.addColorStop(1, '#07050c')
  ctx.save()
  ctx.globalAlpha = darken
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, W, H)

  // Texto entra depois da transição e some suavemente no último 0.6s
  const fadeIn = easeOutCubic(Math.min(1, Math.max(0, (t - 0.5) / 0.8)))
  const fadeOut = Math.min(1, Math.max(0, (OUTRO_SECS - t) / 0.6))
  const a = Math.min(fadeIn, fadeOut)
  const rise = (1 - fadeIn) * 24

  ctx.globalAlpha = a
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#ffffff'
  ctx.shadowColor = 'rgba(236, 72, 153, 0.5)'
  ctx.shadowBlur = 28 * a
  const horizontal = project.format === 'horizontal'
  ctx.font = `800 ${horizontal ? 56 : 64}px Unbounded, Outfit, sans-serif`
  ctx.fillText(project.outroText?.trim() || DEFAULT_OUTRO_TEXT, W / 2, H / 2 + rise, W - 160)
  ctx.shadowBlur = 0

  // Crédito sutil com o nome da música
  ctx.globalAlpha = a * 0.45
  ctx.font = '500 30px Outfit, sans-serif'
  ctx.fillText(
    [project.artist, project.title].filter(Boolean).join(' — '),
    W / 2,
    H / 2 + (horizontal ? 70 : 84) + rise,
    W - 180,
  )

  ctx.restore()
  ctx.globalAlpha = 1
}

/**
 * Desenha um frame no instante t. Toda a matemática é absoluta:
 * as barras NUNCA encolhem — o máximo (maxBarW) representa o tempo total
 * de quem canta MAIS na música inteira.
 * Se `duration` for informado, os últimos FINAL_RANKING_SECS mostram a
 * tela de Ranking Final.
 */
export function drawFrame(
  ctx: CanvasRenderingContext2D,
  cache: HTMLCanvasElement,
  project: Project,
  avatars: Map<string, HTMLImageElement>,
  states: Map<string, MemberRenderState>,
  totals: Map<string, number>,
  t: number,
  duration?: number,
  freq?: Uint8Array,
): void {
  const { W, H } = videoDims(project.format)

  // Limpa o quadro com o cache offscreen (uma única drawImage)
  ctx.drawImage(cache, 0, 0)

  const members = project.members
  const n = members.length

  // --- Tela de Ranking Final nos últimos segundos ---
  // O ranking SÓ pode ativar depois que a ÚLTIMA linha da timeline terminou
  // (endTime absoluto máximo) + margem de segurança de 0.5s. A duração do
  // áudio sozinha não basta: nunca sobrepor o ranking a alguém cantando.
  const lastSegmentEnd = project.segments.reduce((acc, s) => Math.max(acc, s.endTime), 0)
  const rankingStart =
    duration && duration > FINAL_RANKING_SECS + 3
      ? Math.max(duration - FINAL_RANKING_SECS, lastSegmentEnd + 0.5)
      : Infinity
  if (n > 0 && t >= rankingStart) {
    drawFinalRanking(ctx, project, avatars, totals, t - rankingStart, W, H)
    return
  }

  // --- Visualizador de espectro (camada de fundo, atrás das barras) ---
  if (freq) drawVisualizer(ctx, project, freq, t, W, H)

  drawHeaderText(ctx, project, t, W)
  if (n === 0) return

  const sung = computeSungTimes(project, t)
  const lastEnd = computeLastEndTimes(project) // memoizado: não pesa o loop

  // Matemática absoluta: máximo = tempo total do 1º lugar na música toda
  let absoluteMax = 1
  for (const v of totals.values()) absoluteMax = Math.max(absoluteMax, v)

  // Ranking dinâmico: quem cantou mais até agora sobe
  const order = [...members].sort((a, b) => {
    const diff = (sung.get(b.id) ?? 0) - (sung.get(a.id) ?? 0)
    if (diff !== 0) return diff
    return members.indexOf(a) - members.indexOf(b)
  })
  const rank = new Map<string, number>()
  order.forEach((m, i) => rank.set(m.id, i))

  // Layout vertical (zona reservada acima das barras para bolha + letras)
  const horizontal = project.format === 'horizontal'
  const topY = barsTop(project)
  const bottomY = H - (horizontal ? 50 : 120)
  const availH = bottomY - topY
  const rowH = Math.min(horizontal ? 140 : 190, availH / n)
  const startY = topY + (availH - rowH * n) / 2

  const r = Math.max(horizontal ? 22 : 38, Math.min(62, rowH * 0.32)) // raio do avatar
  const avatarCx = 90 + r
  const barX = avatarCx + r + 28
  const barH = Math.max(horizontal ? 18 : 26, Math.min(40, rowH * 0.24))
  const maxBarW = W - barX - 200
  const nameFont = horizontal ? 28 : 34
  const timeFont = horizontal ? 26 : 30

  for (const m of members) {
    let st = states.get(m.id)
    const targetRank = rank.get(m.id) ?? 0
    const targetY = startY + targetRank * rowH + rowH / 2
    const targetW = ((sung.get(m.id) ?? 0) / absoluteMax) * maxBarW
    const active = isActive(project, m.id, t)

    if (!st || !st.initialized) {
      st = { y: targetY, barW: targetW, glow: active ? 1 : 0, initialized: true }
      states.set(m.id, st)
    }

    // Lerp: posição Y (troca de ranking fluida), largura e glow (fade in/out)
    st.y = lerp(st.y, targetY, 0.12)
    st.barW = lerp(st.barW, targetW, 0.18)
    st.glow = lerp(st.glow, active ? 1 : 0, 0.14)

    const cy = st.y
    const glow = st.glow
    // "Saiu do chat": última linha já cantada → escurece para 40%
    const left = hasLeftChat(lastEnd, m.id, t)
    const alpha = left ? 0.4 : 0.35 + 0.65 * glow
    const ringColor = left ? desaturateColor(m.color) : m.color

    ctx.globalAlpha = alpha

    // --- Círculo colorido atrás do avatar (recebe o neon) ---
    if (!left && glow > 0.02) {
      ctx.shadowColor = m.color
      ctx.shadowBlur = 24 * glow
    }
    ctx.fillStyle = ringColor
    ctx.beginPath()
    ctx.arc(avatarCx, cy, r + 5, 0, Math.PI * 2)
    ctx.fill()
    ctx.shadowBlur = 0 // reset imediato para não vazar o brilho

    // --- Avatar (clip circular; P&B pré-renderizado se saiu do chat) ---
    const avatarImg = avatars.get(m.id)
    if (left && avatarImg) {
      drawAvatarSource(ctx, grayscaleImage(avatarImg), avatarCx, cy, r)
    } else {
      drawAvatar(ctx, avatarImg, m.name, avatarCx, cy, r)
    }

    // --- Nome ---
    ctx.fillStyle = '#ffffff'
    ctx.font = `600 ${nameFont}px Outfit, sans-serif`
    ctx.fillText(m.name, barX + 4, cy - barH / 2 - 12, maxBarW)

    // --- Barra pílula (recebe o neon) ---
    const w = Math.max(barH, st.barW + barH) // largura mínima = pílula redonda
    if (!left && glow > 0.02) {
      ctx.shadowColor = m.color
      ctx.shadowBlur = 24 * glow
    }
    ctx.fillStyle = ringColor
    ctx.beginPath()
    ctx.roundRect(barX, cy - barH / 2 + 8, w, barH, barH / 2)
    ctx.fill()
    ctx.shadowBlur = 0 // reset imediato

    // --- Tempo cantado ---
    ctx.fillStyle = 'rgba(255,255,255,0.9)'
    ctx.font = `600 ${timeFont}px Outfit, sans-serif`
    ctx.fillText(`${(sung.get(m.id) ?? 0).toFixed(1)}s`, barX + w + 18, cy + barH / 2)

    // --- Ícone de status: porta no canto do avatar (fica até o fim) ---
    if (left) {
      ctx.globalAlpha = Math.min(1, alpha * 2.2) // badge mais visível que o resto
      drawOffBadge(ctx, avatarCx, cy, r)
    }

    ctx.globalAlpha = 1
  }

  drawVoiceBubble(ctx, project, avatars, states, topY, t, W)
  drawLeftChatToasts(ctx, project, lastEnd, avatars, t, W)
}

function drawAvatar(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement | undefined,
  name: string,
  cx: number,
  cy: number,
  r: number,
): void {
  ctx.save()
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.clip()
  if (img) {
    ctx.drawImage(img, cx - r, cy - r, r * 2, r * 2)
  } else {
    ctx.fillStyle = '#1d1928'
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2)
    ctx.fillStyle = '#ffffff'
    ctx.font = `700 ${Math.round(r * 0.9)}px Outfit, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText((name[0] || '?').toUpperCase(), cx, cy + 2)
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
  }
  ctx.restore()
}

/** Variante que aceita qualquer fonte de imagem (ex: canvas P&B em cache). */
function drawAvatarSource(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  cx: number,
  cy: number,
  r: number,
): void {
  ctx.save()
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.clip()
  ctx.drawImage(source, cx - r, cy - r, r * 2, r * 2)
  ctx.restore()
}

/** Letras ativas no instante t, nas três camadas. */
function activeLyricLayers(project: Project, t: number): {
  hangul: string
  romanized: string
  translation: string
} {
  // Mesmo critério do isActive: fim estritamente exclusivo (t < endTime)
  const active = project.segments.filter(
    (s) => t >= s.startTime && t < s.endTime,
  )
  const uniq = (vals: (string | undefined)[]) => [...new Set(vals.map((v) => v?.trim()).filter(Boolean))] as string[]
  return {
    hangul: uniq(active.map((s) => s.lyricHangul)).join(' / '),
    // Legado: `lyric` antigo é tratado como romanização
    romanized: uniq(active.map((s) => s.lyricRomanized || s.lyric)).join(' / '),
    translation: uniq(active.map((s) => s.lyricTranslation)).join(' / '),
  }
}

/**
 * Bolha de Voz: card flutuante glassmorphism entre o cabeçalho e as barras
 * mostrando avatar + nome de quem canta AGORA. O fade/pop reutiliza o glow
 * (já suavizado por lerp), então a entrada e saída são fluidas. Com vários
 * membros simultâneos, os avatares empilham lado a lado com anéis coloridos.
 */
function drawVoiceBubble(
  ctx: CanvasRenderingContext2D,
  project: Project,
  avatars: Map<string, HTMLImageElement>,
  states: Map<string, MemberRenderState>,
  barsTopY: number,
  t: number,
  W: number,
): void {
  const singers = project.members.filter((m) => (states.get(m.id)?.glow ?? 0) > 0.05)
  if (singers.length === 0) return

  // Opacidade/escala da bolha = maior glow entre os cantores (pop suave)
  const a = Math.min(1, Math.max(...singers.map((m) => states.get(m.id)!.glow)))
  const scale = 0.86 + 0.14 * a

  const layers = activeLyricLayers(project, t)
  const hasLyric = !!(layers.hangul || layers.romanized || layers.translation)

  const headerEndY = headerLayout(project).headerEndY
  // Eixo Y TRAVADO de forma absoluta: a bolha fica sempre no mesmo lugar,
  // com ou sem letra, com 1 ou vários cantores. Só a largura cresce
  // horizontalmente (centralizada), então nada é empurrado para cima/baixo.
  const bubbleCy = headerEndY + 92

  // Geometria: avatares sobrepostos + nomes
  const r = 52
  const overlap = r * 0.75 // deslocamento entre avatares empilhados
  const avatarsW = r * 2 + (singers.length - 1) * overlap
  const names = singers.map((m) => m.name).join(' + ')
  ctx.font = '700 40px Outfit, sans-serif'
  const namesRawW = Math.min(ctx.measureText(names).width, 520)
  ctx.font = '700 22px Outfit, sans-serif'
  const labelW = ctx.measureText('CANTANDO AGORA').width
  // A área de texto precisa caber o MAIOR dos dois textos (nome curto ex: "V"
  // não pode deixar o rótulo "CANTANDO AGORA" vazar para fora da bolha)
  const textAreaW = Math.max(namesRawW, labelW)
  const padX = 34
  const gap = 26
  const cardH = 136
  const cardW = padX + avatarsW + gap + textAreaW + padX
  const mainColor = singers[0].color

  ctx.save()
  ctx.globalAlpha = a
  ctx.translate(W / 2, bubbleCy)
  ctx.scale(scale, scale)
  const x0 = -cardW / 2

  // --- Card glassmorphism com brilho na cor do membro ---
  ctx.shadowColor = mainColor
  ctx.shadowBlur = 34 * a
  ctx.fillStyle = 'rgba(22, 17, 34, 0.55)'
  ctx.beginPath()
  ctx.roundRect(x0, -cardH / 2, cardW, cardH, cardH / 2)
  ctx.fill()
  ctx.shadowBlur = 0

  // Realce de vidro (borda superior clara + contorno colorido sutil)
  ctx.strokeStyle = 'rgba(255,255,255,0.28)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.roundRect(x0, -cardH / 2, cardW, cardH, cardH / 2)
  ctx.stroke()
  ctx.strokeStyle = mainColor
  ctx.globalAlpha = a * 0.45
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.roundRect(x0 - 3, -cardH / 2 - 3, cardW + 6, cardH + 6, (cardH + 6) / 2)
  ctx.stroke()
  ctx.globalAlpha = a

  // --- Avatares empilhados lado a lado ---
  for (let i = singers.length - 1; i >= 0; i--) {
    const m = singers[i]
    const cx = x0 + padX + r + i * overlap

    // Anel na cor do membro
    ctx.shadowColor = m.color
    ctx.shadowBlur = 18 * a
    ctx.fillStyle = m.color
    ctx.beginPath()
    ctx.arc(cx, 0, r + 5, 0, Math.PI * 2)
    ctx.fill()
    ctx.shadowBlur = 0

    drawAvatar(ctx, avatars.get(m.id), m.name, cx, 0, r)
  }

  // --- Nomes ---
  const textX = x0 + padX + avatarsW + gap
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = 'rgba(255,255,255,0.55)'
  ctx.font = '700 22px Outfit, sans-serif'
  ctx.fillText('CANTANDO AGORA', textX, -30)
  ctx.fillStyle = '#ffffff'
  ctx.font = '700 40px Outfit, sans-serif'
  ctx.fillText(names, textX, 14, textAreaW)
  ctx.textBaseline = 'alphabetic'
  ctx.restore()

  // --- Letras sincronizadas em camadas (estilo K-pop edit) ---
  if (hasLyric) {
    drawLyricLayers(ctx, layers, mainColor, bubbleCy + cardH / 2 + 26, barsTopY, a, W)
  }
}

interface LyricLayers {
  hangul: string
  romanized: string
  translation: string
}

/**
 * Letras em até 3 camadas: Hangul (grande), romanização (média) e tradução
 * (menor, itálica). Cada linha tem contorno escuro + glow na cor do membro.
 */
function drawLyricLayers(
  ctx: CanvasRenderingContext2D,
  layers: LyricLayers,
  color: string,
  topY: number,
  maxY: number,
  alpha: number,
  W: number,
): void {
  const maxW = W - 160
  // [texto, fonte, altura de linha, alpha]
  const rows: Array<[string, string, number, number]> = []
  if (layers.hangul)
    rows.push([layers.hangul, `800 48px Outfit, 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif`, 60, 1])
  if (layers.romanized) rows.push([layers.romanized, '800 42px Outfit, sans-serif', 54, 1])
  if (layers.translation) rows.push([layers.translation, 'italic 500 30px Outfit, sans-serif', 42, 0.75])
  if (rows.length === 0) return

  ctx.save()
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  // Calcula altura total (com quebra em até 2 linhas por camada)
  const wrapped: Array<{ lines: string[]; font: string; lineH: number; a: number }> = []
  let totalH = 0
  for (const [text, font, lineH, a] of rows) {
    ctx.font = font
    const lines = wrapText(ctx, text, maxW, 2)
    wrapped.push({ lines, font, lineH, a })
    totalH += lines.length * lineH
  }

  let y = topY + 30
  // Garante que o bloco não invade as barras
  if (y + totalH > maxY - 8) y = Math.max(topY - 20, maxY - 8 - totalH)

  for (const row of wrapped) {
    ctx.font = row.font
    for (const line of row.lines) {
      const cy = y + row.lineH / 2
      ctx.globalAlpha = alpha * row.a
      // Glow na cor do membro
      ctx.shadowColor = color
      ctx.shadowBlur = 26 * alpha
      // Contorno escuro para legibilidade
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.85)'
      ctx.lineWidth = 8
      ctx.lineJoin = 'round'
      ctx.strokeText(line, W / 2, cy, maxW)
      ctx.shadowBlur = 0
      ctx.fillStyle = '#ffffff'
      ctx.fillText(line, W / 2, cy, maxW)
      y += row.lineH
    }
  }

  ctx.restore()
}

/** Quebra texto por palavras em até maxLines linhas. */
function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxW: number,
  maxLines: number,
): string[] {
  const words = text.split(/\s+/)
  const lines: string[] = []
  let current = ''
  for (const w of words) {
    const candidate = current ? `${current} ${w}` : w
    if (ctx.measureText(candidate).width <= maxW || !current) {
      current = candidate
    } else {
      lines.push(current)
      current = w
      if (lines.length === maxLines) break
    }
  }
  if (current && lines.length < maxLines) lines.push(current)
  return lines
}

const MEDAL_COLORS = ['#FFD700', '#C0C0C0', '#CD7F32']

/**
 * Tela de Ranking Final: nos últimos segundos, o placar definitivo entra
 * com fade + linhas em cascata, medalhas para o top 3 e porcentagens.
 */
function drawFinalRanking(
  ctx: CanvasRenderingContext2D,
  project: Project,
  avatars: Map<string, HTMLImageElement>,
  totals: Map<string, number>,
  elapsed: number, // segundos desde o início da tela final
  W: number,
  H: number,
): void {
  const fade = easeOutCubic(Math.min(1, elapsed / 0.8))

  // Overlay escuro por cima do fundo
  ctx.fillStyle = `rgba(6, 5, 12, ${0.82 * fade})`
  ctx.fillRect(0, 0, W, H)

  const sorted = [...project.members].sort(
    (a, b) => (totals.get(b.id) ?? 0) - (totals.get(a.id) ?? 0),
  )
  const totalAll = sorted.reduce((acc, m) => acc + (totals.get(m.id) ?? 0), 0) || 1

  ctx.save()
  ctx.textAlign = 'center'

  // Título da tela
  ctx.globalAlpha = fade
  ctx.shadowColor = 'rgba(236, 72, 153, 0.6)'
  ctx.shadowBlur = 28 * fade
  ctx.fillStyle = '#ffffff'
  const titleFont = project.format === 'horizontal' ? 56 : 64
  ctx.font = `800 ${titleFont}px Unbounded, Outfit, sans-serif`
  const titleY = project.format === 'horizontal' ? 110 : 260
  ctx.fillText('RESULTADO FINAL', W / 2, titleY, W - 120)
  ctx.shadowBlur = 0
  ctx.globalAlpha = fade * 0.55
  ctx.font = '600 30px Outfit, sans-serif'
  ctx.fillText(project.title || '', W / 2, titleY + 56, W - 160)

  // Linhas do placar em cascata
  const n = sorted.length
  const listTop = titleY + 120
  const listBottom = H - (project.format === 'horizontal' ? 60 : 160)
  const rowH = Math.min(project.format === 'horizontal' ? 130 : 170, (listBottom - listTop) / Math.max(n, 1))
  const r = Math.max(24, Math.min(56, rowH * 0.34))
  const rowW = Math.min(W - 160, project.format === 'horizontal' ? 1100 : 920)
  const x0 = (W - rowW) / 2

  ctx.textAlign = 'left'
  for (let i = 0; i < n; i++) {
    const m = sorted[i]
    // Cascata: cada linha entra 0.18s depois da anterior
    const rowP = easeOutCubic(Math.max(0, Math.min(1, (elapsed - 0.35 - i * 0.18) / 0.5)))
    if (rowP <= 0) continue
    const cy = listTop + i * rowH + rowH / 2
    const slide = (1 - rowP) * 60

    ctx.globalAlpha = fade * rowP

    // Fundo da linha (glass sutil; top 3 com contorno da medalha)
    const isTop3 = i < 3
    ctx.fillStyle = 'rgba(255,255,255,0.06)'
    ctx.beginPath()
    ctx.roundRect(x0 + slide, cy - rowH / 2 + 8, rowW, rowH - 16, (rowH - 16) / 2)
    ctx.fill()
    if (isTop3) {
      ctx.strokeStyle = MEDAL_COLORS[i]
      ctx.globalAlpha = fade * rowP * 0.7
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.roundRect(x0 + slide, cy - rowH / 2 + 8, rowW, rowH - 16, (rowH - 16) / 2)
      ctx.stroke()
      ctx.globalAlpha = fade * rowP
    }

    // Medalha / posição
    const medalCx = x0 + slide + 24 + 28
    ctx.fillStyle = isTop3 ? MEDAL_COLORS[i] : 'rgba(255,255,255,0.18)'
    if (isTop3) {
      ctx.shadowColor = MEDAL_COLORS[i]
      ctx.shadowBlur = 16 * rowP
    }
    ctx.beginPath()
    ctx.arc(medalCx, cy, 28, 0, Math.PI * 2)
    ctx.fill()
    ctx.shadowBlur = 0
    ctx.fillStyle = isTop3 ? '#1a1408' : '#ffffff'
    ctx.font = '800 30px Outfit, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(String(i + 1), medalCx, cy + 1)
    ctx.textAlign = 'left'

    // Avatar com anel colorido
    const avCx = medalCx + 28 + 22 + r
    ctx.fillStyle = m.color
    ctx.beginPath()
    ctx.arc(avCx, cy, r + 4, 0, Math.PI * 2)
    ctx.fill()
    drawAvatar(ctx, avatars.get(m.id), m.name, avCx, cy, r)

    // Nome + estatísticas
    const textX = avCx + r + 24
    const secs = totals.get(m.id) ?? 0
    const pct = (secs / totalAll) * 100
    ctx.fillStyle = '#ffffff'
    ctx.font = '700 36px Outfit, sans-serif'
    ctx.fillText(m.name, textX, cy - 14, rowW - (textX - x0) - 200)
    ctx.fillStyle = 'rgba(255,255,255,0.6)'
    ctx.font = '500 27px Outfit, sans-serif'
    ctx.fillText(`${secs.toFixed(1)}s cantados`, textX, cy + 26)

    // Porcentagem à direita
    ctx.textAlign = 'right'
    ctx.fillStyle = m.color
    ctx.font = '800 44px Outfit, sans-serif'
    ctx.fillText(`${pct.toFixed(1)}%`, x0 + slide + rowW - 34, cy + 6)
    ctx.textAlign = 'left'

    ctx.textBaseline = 'alphabetic'
  }

  ctx.restore()
  ctx.globalAlpha = 1
}
