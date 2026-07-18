'use client'

import { useState } from 'react'
import { Languages, Loader2, Music } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Member, Segment } from '@/lib/types'

interface LyricsPanelProps {
  members: Member[]
  segments: Segment[]
  onChange: (segments: Segment[]) => void
}

function formatTime(s: number): string {
  const m = Math.floor(s / 60)
  const r = (s % 60).toFixed(1).padStart(4, '0')
  return `${m}:${r}`
}

/**
 * Aba 'Letras': todos os segmentos da Timeline em ordem cronológica, cada um
 * com a foto do membro (referência visual) e 3 inputs — Hangul, Romanizado e
 * Tradução. Os campos são os mesmos que o renderer do vídeo já consome.
 */
export function LyricsPanel({ members, segments, onChange }: LyricsPanelProps) {
  const sorted = [...segments].sort((a, b) => a.startTime - b.startTime)
  const [translatingId, setTranslatingId] = useState<string | null>(null)
  const [errorId, setErrorId] = useState<string | null>(null)

  const patchSegment = (id: string, p: Partial<Segment>) => {
    onChange(segments.map((s) => (s.id === id ? { ...s, ...p } : s)))
  }

  // Auto-Traduzir com IA: envia o Hangul (ou romanização legada) e preenche
  // romanização + tradução — mesmo endpoint que a Timeline usava antes
  const autoTranslate = async (s: Segment) => {
    const sourceText = s.lyricHangul?.trim() || (s.lyricRomanized ?? s.lyric ?? '').trim()
    if (!sourceText || translatingId) return
    setTranslatingId(s.id)
    setErrorId(null)
    try {
      const res = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: sourceText }),
      })
      if (!res.ok) throw new Error('translate failed')
      const data = (await res.json()) as { romanized: string; translation: string }
      patchSegment(s.id, {
        lyricRomanized: data.romanized,
        lyricTranslation: data.translation,
        lyric: undefined,
      })
    } catch {
      setErrorId(s.id)
    } finally {
      setTranslatingId(null)
    }
  }

  const inputClass =
    'h-11 w-full min-w-0 rounded border border-input bg-transparent px-2 text-sm outline-none placeholder:text-muted-foreground/60 focus-visible:ring-2 focus-visible:ring-ring md:h-8 md:text-xs'

  if (sorted.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border p-6 text-center">
        <Music className="size-5 text-muted-foreground" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">
          Nenhum segmento ainda. Crie os blocos de tempo na aba Timeline e volte aqui para
          preencher as letras.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-muted-foreground">
        Preencha as letras de cada bloco. Elas aparecem sincronizadas no vídeo.
      </p>
      <ul className="flex flex-col gap-2">
        {sorted.map((s) => {
          const m = members.find((mm) => mm.id === s.memberId)
          return (
            <li
              key={s.id}
              className="flex flex-col gap-2 rounded-md border border-border bg-card p-2.5 transition-all duration-200 ease-in-out animate-in fade-in slide-in-from-top-1 hover:border-primary/40"
            >
              <div className="flex items-center gap-2">
                {m?.avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={m.avatar}
                    alt={`Foto de ${m.name}`}
                    className="size-8 shrink-0 rounded-full border-2 object-cover"
                    style={{ borderColor: m.color }}
                  />
                ) : (
                  <span
                    className="flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-background"
                    style={{ backgroundColor: m?.color ?? '#888' }}
                    aria-hidden="true"
                  >
                    {(m?.name?.[0] ?? '?').toUpperCase()}
                  </span>
                )}
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {m?.name ?? 'Membro removido'}
                </span>
                {s.isAdlib && (
                  <span className="shrink-0 rounded-full border border-primary bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary">
                    AD-LIB
                  </span>
                )}
                <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                  {formatTime(s.startTime)} → {formatTime(s.endTime)}
                </span>
              </div>
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-1.5">
                  <input
                    value={s.lyricHangul ?? ''}
                    onChange={(e) => patchSegment(s.id, { lyricHangul: e.target.value })}
                    placeholder="한국어 (Hangul)"
                    lang="ko"
                    className={inputClass}
                    aria-label={`Letra em Hangul de ${m?.name ?? 'membro'}`}
                  />
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-11 shrink-0 px-2.5 text-xs md:h-8 md:px-2"
                    onClick={() => autoTranslate(s)}
                    disabled={
                      !(s.lyricHangul?.trim() || (s.lyricRomanized ?? s.lyric ?? '').trim()) ||
                      translatingId !== null
                    }
                    title="Preenche romanização e tradução automaticamente com IA"
                    aria-label="Auto-traduzir letra"
                  >
                    {translatingId === s.id ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Languages className="size-3.5" />
                    )}
                    <span className="hidden md:inline-block">Auto</span>
                  </Button>
                </div>
                <input
                  value={s.lyricRomanized ?? s.lyric ?? ''}
                  onChange={(e) => patchSegment(s.id, { lyricRomanized: e.target.value })}
                  placeholder="Romanizado"
                  className={inputClass}
                  aria-label={`Letra romanizada de ${m?.name ?? 'membro'}`}
                />
                <input
                  value={s.lyricTranslation ?? ''}
                  onChange={(e) => patchSegment(s.id, { lyricTranslation: e.target.value })}
                  placeholder="Tradução"
                  className={inputClass}
                  aria-label={`Tradução da letra de ${m?.name ?? 'membro'}`}
                />
                {errorId === s.id && (
                  <p className="text-xs text-destructive" role="alert">
                    Falha ao traduzir. Tente novamente.
                  </p>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
