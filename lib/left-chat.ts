import type { Member, Project } from './types'

/** Duração do toast "saiu do chat" na tela (segundos). */
export const TOAST_SECS = 3

// ---------------------------------------------------------------------------
// 1. Lógica de cálculo (memoizada): último endTime de cada membro.
//    WeakMap com a referência do array de segmentos como chave — recalcula
//    apenas quando a timeline muda, nunca dentro do loop do Canvas.
// ---------------------------------------------------------------------------
const lastEndCache = new WeakMap<object, Map<string, number>>()

/** Mapa memberId → último segundo em que ele canta na música inteira. */
export function computeLastEndTimes(project: Project): Map<string, number> {
  const key = project.segments
  const cached = lastEndCache.get(key)
  if (cached) return cached

  const map = new Map<string, number>()
  for (const seg of project.segments) {
    const prev = map.get(seg.memberId) ?? 0
    if (seg.endTime > prev) map.set(seg.memberId, seg.endTime)
  }
  lastEndCache.set(key, map)
  return map
}

/** True se o membro já cantou sua última linha no instante t. */
export function hasLeftChat(lastEnd: Map<string, number>, memberId: string, t: number): boolean {
  const end = lastEnd.get(memberId)
  return end !== undefined && t > end
}

// ---------------------------------------------------------------------------
// 3. Estado inativo: avatar em preto e branco, pré-renderizado UMA vez em
//    canvas offscreen (nunca use ctx.filter dentro do loop principal).
// ---------------------------------------------------------------------------
const grayscaleCache = new WeakMap<HTMLImageElement, HTMLCanvasElement>()

export function grayscaleImage(img: HTMLImageElement): HTMLCanvasElement {
  const cached = grayscaleCache.get(img)
  if (cached) return cached

  const c = document.createElement('canvas')
  const size = 256 // resolução suficiente para avatares pequenos
  c.width = size
  c.height = size
  const cctx = c.getContext('2d')!
  cctx.filter = 'grayscale(1)'
  cctx.drawImage(img, 0, 0, size, size)
  grayscaleCache.set(img, c)
  return c
}

/** Cor dessaturada para anel/barra de quem já saiu (cache por cor). */
const grayColorCache = new Map<string, string>()

export function desaturateColor(color: string): string {
  const cached = grayColorCache.get(color)
  if (cached) return cached
  // Converte hex → luminância → cinza médio com leve tom da cor original
  let gray = '#6b6b74'
  const m = /^#?([0-9a-f]{6})$/i.exec(color.trim())
  if (m) {
    const v = parseInt(m[1], 16)
    const rr = (v >> 16) & 255
    const gg = (v >> 8) & 255
    const bb = v & 255
    const lum = Math.round(0.299 * rr + 0.587 * gg + 0.114 * bb)
    // Mistura 80% cinza / 20% cor original para manter identidade sutil
    const mix = (ch: number) => Math.round(lum * 0.8 + ch * 0.2)
    gray = `rgb(${mix(rr)}, ${mix(gg)}, ${mix(bb)})`
  }
  grayColorCache.set(color, gray)
  return gray
}

// ---------------------------------------------------------------------------
// 4. Ícone de status: porta no canto inferior do avatar (desenhada em
//    vetores — visual consistente em qualquer plataforma de exportação).
// ---------------------------------------------------------------------------
export function drawOffBadge(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
): void {
  const br = Math.max(14, r * 0.34) // raio do badge
  const bx = cx + r * 0.72
  const by = cy + r * 0.72

  ctx.save()
  // Disco escuro com contorno
  ctx.fillStyle = '#232030'
  ctx.beginPath()
  ctx.arc(bx, by, br, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,0.5)'
  ctx.lineWidth = 2
  ctx.stroke()

  // Porta entreaberta (retângulo + maçaneta)
  const dw = br * 0.82
  const dh = br * 1.1
  ctx.fillStyle = '#c9a35c'
  ctx.beginPath()
  ctx.roundRect(bx - dw / 2, by - dh / 2, dw, dh, 2)
  ctx.fill()
  ctx.strokeStyle = 'rgba(0,0,0,0.55)'
  ctx.lineWidth = 1.5
  ctx.stroke()
  ctx.fillStyle = '#3a2f1b'
  ctx.beginPath()
  ctx.arc(bx + dw * 0.24, by, Math.max(1.6, br * 0.11), 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

// ---------------------------------------------------------------------------
// 2. Animação de pop-up: toasts estilo notificação de celular.
//    Determinístico por tempo (visível em [lastEnd, lastEnd + TOAST_SECS]),
//    então "só aparece uma vez por membro" vale no play linear e na
//    exportação, sem estado mutável.
// ---------------------------------------------------------------------------
function easeOutBack(x: number): number {
  const c1 = 1.70158
  const c3 = c1 + 1
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2)
}

export function drawLeftChatToasts(
  ctx: CanvasRenderingContext2D,
  project: Project,
  lastEnd: Map<string, number>,
  avatars: Map<string, HTMLImageElement>,
  t: number,
  W: number,
): void {
  // Toasts ativos neste instante (normalmente 0 ou 1; empilha se coincidir)
  const active: { member: Member; age: number }[] = []
  for (const m of project.members) {
    const end = lastEnd.get(m.id)
    if (end === undefined || end <= 0.01) continue
    const age = t - end
    if (age > 0 && age <= TOAST_SECS) active.push({ member: m, age })
  }
  if (active.length === 0) return

  const horizontal = W > 1200
  const toastW = horizontal ? 420 : 480
  const toastH = 84
  // 16:9: margens generosas (48px) para o toast não parecer grudado na borda
  const baseY = horizontal ? 48 : 60
  const marginX = horizontal ? 48 : 28

  active.forEach(({ member: m, age }, i) => {
    // Entrada: pop com overshoot (0→0.35s). Saída: fade + sobe (últimos 0.6s)
    const inP = Math.min(1, age / 0.35)
    const outP = Math.max(0, (age - (TOAST_SECS - 0.6)) / 0.6)
    const alpha = Math.min(1, inP * 1.4) * (1 - outP)
    const pop = easeOutBack(inP)
    const rise = (1 - pop) * 30 + outP * 26 // entra subindo, sai subindo mais

    const x0 = W - toastW - marginX
    const y0 = baseY + i * (toastH + 12) - rise

    ctx.save()
    ctx.globalAlpha = alpha

    // Card escuro estilo notificação
    ctx.shadowColor = 'rgba(0,0,0,0.6)'
    ctx.shadowBlur = 22
    ctx.fillStyle = 'rgba(24, 20, 36, 0.92)'
    ctx.beginPath()
    ctx.roundRect(x0, y0, toastW, toastH, 20)
    ctx.fill()
    ctx.shadowBlur = 0
    ctx.strokeStyle = 'rgba(255,255,255,0.16)'
    ctx.lineWidth = 1.5
    ctx.stroke()

    // Mini avatar em P&B (já saiu do chat)
    const ar = 26
    const acx = x0 + 20 + ar
    const acy = y0 + toastH / 2
    ctx.fillStyle = desaturateColor(m.color)
    ctx.beginPath()
    ctx.arc(acx, acy, ar + 3, 0, Math.PI * 2)
    ctx.fill()
    const img = avatars.get(m.id)
    ctx.save()
    ctx.beginPath()
    ctx.arc(acx, acy, ar, 0, Math.PI * 2)
    ctx.clip()
    if (img) {
      ctx.drawImage(grayscaleImage(img), acx - ar, acy - ar, ar * 2, ar * 2)
    } else {
      ctx.fillStyle = '#1d1928'
      ctx.fillRect(acx - ar, acy - ar, ar * 2, ar * 2)
      ctx.fillStyle = '#ffffff'
      ctx.font = `700 ${Math.round(ar)}px Outfit, sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText((m.name[0] || '?').toUpperCase(), acx, acy + 1)
    }
    ctx.restore()

    // Texto da notificação
    const tx = acx + ar + 16
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = '#ffffff'
    ctx.font = '700 27px Outfit, sans-serif'
    ctx.fillText(`${m.name} left the chat`, tx, y0 + toastH / 2 - 12, toastW - (tx - x0) - 60)
    ctx.fillStyle = 'rgba(255,255,255,0.5)'
    ctx.font = '500 21px Outfit, sans-serif'
    ctx.fillText('última linha cantada', tx, y0 + toastH / 2 + 18, toastW - (tx - x0) - 60)

    // Porta no canto direito do toast
    drawOffBadge(ctx, x0 + toastW - 40, y0 + toastH / 2 - 8, 26)

    ctx.textBaseline = 'alphabetic'
    ctx.restore()
  })
}
