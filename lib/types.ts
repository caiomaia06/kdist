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
}

export type VideoFormat = 'vertical' | 'horizontal'

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
