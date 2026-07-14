import type { Project } from './types'

export const VIDEO_W = 1080
export const VIDEO_H = 1920

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

/**
 * Cache offscreen do fundo: capa com blur pesado + overlay escuro + textos
 * estáticos. Desenhado UMA única vez — o loop principal apenas faz
 * ctx.drawImage(cache, 0, 0). Nunca use ctx.filter dentro do loop.
 */
export function buildBackgroundCache(
  project: Project,
  coverImg: HTMLImageElement | null,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = VIDEO_W
  canvas.height = VIDEO_H
  const ctx = canvas.getContext('2d')!

  if (coverImg) {
    // Capa esticada em cover, com blur pesado (apenas aqui, fora do loop)
    const scale = Math.max(VIDEO_W / coverImg.width, VIDEO_H / coverImg.height) * 1.2
    const w = coverImg.width * scale
    const h = coverImg.height * scale
    ctx.filter = 'blur(60px)'
    ctx.drawImage(coverImg, (VIDEO_W - w) / 2, (VIDEO_H - h) / 2, w, h)
    ctx.filter = 'none'
  } else {
    const grad = ctx.createLinearGradient(0, 0, 0, VIDEO_H)
    grad.addColorStop(0, '#16121f')
    grad.addColorStop(1, '#0a0810')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, VIDEO_W, VIDEO_H)
  }

  // Overlay escuro para contraste
  ctx.fillStyle = 'rgba(6, 5, 12, 0.72)'
  ctx.fillRect(0, 0, VIDEO_W, VIDEO_H)

  // Capa nítida pequena no topo (se existir)
  if (coverImg) {
    const size = 140
    const cx = VIDEO_W / 2
    const cy = 190
    ctx.save()
    ctx.beginPath()
    ctx.roundRect(cx - size / 2, cy - size / 2, size, size, 24)
    ctx.clip()
    ctx.drawImage(coverImg, cx - size / 2, cy - size / 2, size, size)
    ctx.restore()
    ctx.strokeStyle = 'rgba(255,255,255,0.25)'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.roundRect(cx - size / 2, cy - size / 2, size, size, 24)
    ctx.stroke()
  }

  // Textos estáticos
  ctx.textAlign = 'center'
  ctx.fillStyle = 'rgba(255,255,255,0.55)'
  ctx.font = '600 30px Outfit, sans-serif'
  ctx.fillText('LINE DISTRIBUTION', VIDEO_W / 2, coverImg ? 320 : 200)

  ctx.fillStyle = '#ffffff'
  ctx.font = '800 68px Outfit, sans-serif'
  ctx.fillText(project.title || 'Sem título', VIDEO_W / 2, coverImg ? 400 : 280, VIDEO_W - 120)

  ctx.fillStyle = 'rgba(255,255,255,0.65)'
  ctx.font = '500 42px Outfit, sans-serif'
  ctx.fillText(project.artist || '', VIDEO_W / 2, coverImg ? 460 : 340, VIDEO_W - 160)

  ctx.textAlign = 'left'
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
  return project.segments.some(
    (s) => s.memberId === memberId && t >= s.startTime && t <= s.endTime,
  )
}

/**
 * Desenha um frame no instante t. Toda a matemática é absoluta:
 * as barras NUNCA encolhem — o máximo (maxBarW) representa o tempo total
 * de quem canta MAIS na música inteira.
 */
export function drawFrame(
  ctx: CanvasRenderingContext2D,
  cache: HTMLCanvasElement,
  project: Project,
  avatars: Map<string, HTMLImageElement>,
  states: Map<string, MemberRenderState>,
  totals: Map<string, number>,
  t: number,
): void {
  // Limpa o quadro com o cache offscreen (uma única drawImage)
  ctx.drawImage(cache, 0, 0)

  const members = project.members
  const n = members.length
  if (n === 0) return

  const sung = computeSungTimes(project, t)

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

  // Layout vertical (zona reservada acima das barras para a Bolha de Voz;
  // se o projeto tem letras, a zona cresce para acomodar as lyrics)
  const hasLyrics = project.segments.some((s) => s.lyric?.trim())
  const topY = project.coverImage ? (hasLyrics ? 790 : 700) : (hasLyrics ? 670 : 580)
  const bottomY = VIDEO_H - 120
  const availH = bottomY - topY
  const rowH = Math.min(190, availH / n)
  const startY = topY + (availH - rowH * n) / 2

  const r = Math.max(38, Math.min(62, rowH * 0.32)) // raio do avatar
  const avatarCx = 90 + r
  const barX = avatarCx + r + 28
  const barH = Math.max(26, Math.min(40, rowH * 0.24))
  const maxBarW = VIDEO_W - barX - 200

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
    const alpha = 0.35 + 0.65 * glow

    ctx.globalAlpha = alpha

    // --- Círculo colorido atrás do avatar (recebe o neon) ---
    if (glow > 0.02) {
      ctx.shadowColor = m.color
      ctx.shadowBlur = 24 * glow
    }
    ctx.fillStyle = m.color
    ctx.beginPath()
    ctx.arc(avatarCx, cy, r + 5, 0, Math.PI * 2)
    ctx.fill()
    ctx.shadowBlur = 0 // reset imediato para não vazar o brilho

    // --- Avatar (clip circular) ---
    const img = avatars.get(m.id)
    ctx.save()
    ctx.beginPath()
    ctx.arc(avatarCx, cy, r, 0, Math.PI * 2)
    ctx.clip()
    if (img) {
      ctx.drawImage(img, avatarCx - r, cy - r, r * 2, r * 2)
    } else {
      ctx.fillStyle = '#1d1928'
      ctx.fillRect(avatarCx - r, cy - r, r * 2, r * 2)
      ctx.fillStyle = '#ffffff'
      ctx.font = `700 ${Math.round(r * 0.9)}px Outfit, sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText((m.name[0] || '?').toUpperCase(), avatarCx, cy + 2)
      ctx.textAlign = 'left'
      ctx.textBaseline = 'alphabetic'
    }
    ctx.restore()

    // --- Nome ---
    ctx.fillStyle = '#ffffff'
    ctx.font = '600 34px Outfit, sans-serif'
    ctx.fillText(m.name, barX + 4, cy - barH / 2 - 12, maxBarW)

    // --- Barra pílula (recebe o neon) ---
    const w = Math.max(barH, st.barW + barH) // largura mínima = pílula redonda
    if (glow > 0.02) {
      ctx.shadowColor = m.color
      ctx.shadowBlur = 24 * glow
    }
    ctx.fillStyle = m.color
    ctx.beginPath()
    ctx.roundRect(barX, cy - barH / 2 + 8, w, barH, barH / 2)
    ctx.fill()
    ctx.shadowBlur = 0 // reset imediato

    // --- Tempo cantado ---
    ctx.fillStyle = 'rgba(255,255,255,0.9)'
    ctx.font = '600 30px Outfit, sans-serif'
    ctx.fillText(`${(sung.get(m.id) ?? 0).toFixed(1)}s`, barX + w + 18, cy + barH / 2)

    ctx.globalAlpha = 1
  }

  drawVoiceBubble(ctx, project, avatars, states, topY, t)
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
): void {
  const singers = project.members.filter((m) => (states.get(m.id)?.glow ?? 0) > 0.05)
  if (singers.length === 0) return

  // Opacidade/escala da bolha = maior glow entre os cantores (pop suave)
  const a = Math.min(1, Math.max(...singers.map((m) => states.get(m.id)!.glow)))
  const scale = 0.86 + 0.14 * a

  // Letra ativa neste instante (única, mesmo em duetos onde cada segmento
  // repete o texto)
  const activeLyrics = [
    ...new Set(
      project.segments
        .filter((s) => t >= s.startTime && t <= s.endTime && s.lyric?.trim())
        .map((s) => s.lyric!.trim()),
    ),
  ]
  const lyric = activeLyrics.join(' / ')

  const headerEndY = project.coverImage ? 470 : 350
  // Com letra, a bolha sobe para abrir espaço para o texto abaixo dela
  const bubbleCy = lyric ? headerEndY + 92 : (headerEndY + barsTopY) / 2 + 10

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
  ctx.translate(VIDEO_W / 2, bubbleCy)
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

    const img = avatars.get(m.id)
    ctx.save()
    ctx.beginPath()
    ctx.arc(cx, 0, r, 0, Math.PI * 2)
    ctx.clip()
    if (img) {
      ctx.drawImage(img, cx - r, -r, r * 2, r * 2)
    } else {
      ctx.fillStyle = '#1d1928'
      ctx.fillRect(cx - r, -r, r * 2, r * 2)
      ctx.fillStyle = '#ffffff'
      ctx.font = `700 ${Math.round(r * 0.9)}px Outfit, sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText((m.name[0] || '?').toUpperCase(), cx, 2)
    }
    ctx.restore()
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

  // --- Letra sincronizada (estilo K-pop edit) ---
  if (lyric) {
    drawLyric(ctx, lyric, mainColor, bubbleCy + cardH / 2 + 26, barsTopY, a)
  }
}

/**
 * Letra do trecho atual: texto grande e grosso, com contorno escuro +
 * sombra para legibilidade sobre qualquer fundo, e glow na cor do membro.
 * Quebra em até 2 linhas centralizadas; o fade acompanha a bolha.
 */
function drawLyric(
  ctx: CanvasRenderingContext2D,
  lyric: string,
  color: string,
  topY: number,
  maxY: number,
  alpha: number,
): void {
  const maxW = VIDEO_W - 160
  const fontSize = 46
  const lineH = 58
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.font = `800 ${fontSize}px Outfit, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  // Quebra por palavras em no máximo 2 linhas
  const words = lyric.split(/\s+/)
  const lines: string[] = []
  let current = ''
  for (const w of words) {
    const candidate = current ? `${current} ${w}` : w
    if (ctx.measureText(candidate).width <= maxW || !current) {
      current = candidate
    } else {
      lines.push(current)
      current = w
      if (lines.length === 2) break
    }
  }
  if (current && lines.length < 2) lines.push(current)
  // Se sobrou texto (letra muito longa), sinaliza com reticências
  if (lines.length === 2 && ctx.measureText(lines[1]).width > maxW) {
    lines[1] = lines[1].slice(0, -1)
  }

  const blockH = lines.length * lineH
  let y = topY + lineH / 2
  // Garante que o bloco não invade as barras
  if (topY + blockH > maxY - 8) y = maxY - 8 - blockH + lineH / 2

  for (const line of lines) {
    // Glow na cor do membro
    ctx.shadowColor = color
    ctx.shadowBlur = 26 * alpha
    // Contorno escuro para legibilidade
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.85)'
    ctx.lineWidth = 8
    ctx.lineJoin = 'round'
    ctx.strokeText(line, VIDEO_W / 2, y, maxW)
    ctx.shadowBlur = 0
    // Preenchimento branco por cima
    ctx.fillStyle = '#ffffff'
    ctx.fillText(line, VIDEO_W / 2, y, maxW)
    y += lineH
  }

  ctx.restore()
}
