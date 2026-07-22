export interface Member {
  id: string
  name: string
  color: string
  avatar?: string // dataURL comprimido (150x150 jpeg 0.6)
}

export interface Segment {
  id: string
  memberId: string
  startTime: number // segundos
  endTime: number // segundos
  lyric?: string // legado: letra única (tratada como romanização)
  lyricHangul?: string // letra original em Hangul
  lyricRomanized?: string // romanização
  lyricTranslation?: string // tradução
  isAdlib?: boolean // vocal de apoio: não ocupa o 'Cantando Agora' principal
}

export type VideoFormat = 'vertical' | 'horizontal'

// ---------- Motor de Customização (aba Design) ----------

/** Fonte global do vídeo (aplicada em todos os textos do canvas). */
export type VideoFont = 'default' | 'sans' | 'serif' | 'impact' | 'mono'

/** Formato da máscara dos avatares dos membros. */
export type AvatarShape = 'circle' | 'rounded' | 'square'

/** Âncora horizontal do bloco de letras (16:9 principalmente). */
export type LyricPosition = 'left' | 'center' | 'right'

export interface DesignSettings {
  font: VideoFont
  lyricScale: number // multiplicador do tamanho das letras: 0.8 a 1.5
  avatarShape: AvatarShape
  barThickness: number // espessura das barras: 1 (fina) a 10 (grossa); 5 = padrão
  lyricPosition: LyricPosition | 'auto' // 'auto' = padrão do formato
  showCover: boolean // capa do álbum (pequena, no header)
  showLabel: boolean // texto 'LINE DISTRIBUTION'
  showTimes: boolean // tempos numéricos ao lado das barras
}

export const DEFAULT_DESIGN: DesignSettings = {
  font: 'default',
  lyricScale: 1,
  avatarShape: 'circle',
  barThickness: 5,
  lyricPosition: 'auto',
  showCover: true,
  showLabel: true,
  showTimes: true,
}

// ---------- Vídeo Complementar (PiP / Background no Canvas) ----------

/**
 * Modo de exibição do vídeo complementar:
 * - 'background': fundo completo com blur + escurecimento
 * - 'pip': janela pequena no canto (Picture-in-Picture)
 * - 'lyrics': substitui a área das letras
 * - 'left': terço esquerdo da tela (APENAS 16:9, split screen)
 */
export type VideoOverlayMode = 'background' | 'pip' | 'lyrics' | 'left'

export interface VideoOverlaySettings {
  enabled: boolean
  mode: VideoOverlayMode
  blur: number // desfoque em px (modo background): 0 a 20
  darken: number // escurecimento 0 a 0.8 (modo background)
  borderWidth: number // espessura da moldura em px (modos com janela): 0 a 12
  borderColor: string // cor da moldura
  cornerRadius: number // arredondamento dos cantos em px: 0 a 48
}

export const DEFAULT_VIDEO_OVERLAY: VideoOverlaySettings = {
  enabled: false,
  mode: 'pip',
  blur: 8,
  darken: 0.55,
  borderWidth: 4,
  borderColor: '#ffffff',
  cornerRadius: 24,
}

export interface Group {
  id: string
  name: string
  members: Member[]
  createdAt: number
  updatedAt: number
}

export interface Project {
  id: string
  title: string
  artist: string
  coverImage?: string // dataURL comprimido (150x150 jpeg 0.6)
  members: Member[]
  segments: Segment[]
  hasAudio: boolean
  audioName?: string
  duration?: number // segundos
  format?: VideoFormat // 'vertical' (TikTok 9:16, padrão) ou 'horizontal' (YouTube 16:9)
  introEnabled?: boolean // tela cinematográfica de entrada (3s antes do áudio)
  outroEnabled?: boolean // tela cinematográfica de saída (3s após o ranking)
  outroText?: string // texto de encerramento (padrão: 'Thanks for watching!')
  design?: Partial<DesignSettings> // customização visual (aba Design)
  video?: Partial<VideoOverlaySettings> // vídeo complementar (PiP/background)
  videoName?: string // nome do arquivo de vídeo (guardado no IndexedDB local)
  createdAt: number
  updatedAt: number
}

export const MEMBER_COLORS = [
  '#ff4d8d',
  '#4dd2ff',
  '#ffd24d',
  '#7dff8a',
  '#ff8a4d',
  '#c04dff',
  '#4d6bff',
  '#ff4d4d',
  '#4dffd2',
  '#ff9ec2',
]

export function uid(): string {
  // UUID nativo: compatível com as chaves primárias uuid do Supabase
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
}
