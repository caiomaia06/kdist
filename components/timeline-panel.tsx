'use client'

import { useEffect, useRef, useState } from 'react'
import { CircleDot, Keyboard, Music, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { uid, type Member, type Segment } from '@/lib/types'

// Os campos de letra (Hangul/Romanizado/Tradução) agora vivem exclusivamente
// na aba 'Letras' (components/lyrics-panel.tsx). A Timeline foca apenas em
// QUEM canta e QUANDO (membro + startTime/endTime).

interface TimelinePanelProps {
  members: Member[]
  segments: Segment[]
  onChange: (segments: Segment[]) => void
  getTime: () => number
}

function fmt(s: number): string {
  return s.toFixed(1)
}

export function TimelinePanel({ members, segments, onChange, getTime }: TimelinePanelProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [recording, setRecording] = useState<{ memberIds: string[]; startTime: number } | null>(null)
  const [spaceHeld, setSpaceHeld] = useState(false)

  const memberById = (id: string) => members.find((m) => m.id === id)

  const toggleMember = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  const selectedNames = selectedIds
    .map((id) => memberById(id)?.name)
    .filter(Boolean)
    .join(' + ')

  // Cria um segmento por membro selecionado (mesmos tempos = cantam juntos)
  const makeSegments = (memberIds: string[], startTime: number, endTime: number): Segment[] =>
    memberIds.map((mid) => ({ id: uid(), memberId: mid, startTime, endTime }))

  // Refs para os listeners globais não ficarem obsoletos
  const selectedIdsRef = useRef(selectedIds)
  selectedIdsRef.current = selectedIds
  const segmentsRef = useRef(segments)
  segmentsRef.current = segments
  const spaceStartRef = useRef<number | null>(null)

  // Segurar ESPAÇO grava a parte do membro selecionado
  useEffect(() => {
    const isTyping = (el: EventTarget | null) => {
      const t = el as HTMLElement | null
      return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat || isTyping(e.target)) return
      if (selectedIdsRef.current.length === 0) return
      e.preventDefault()
      if (spaceStartRef.current === null) {
        spaceStartRef.current = getTime()
        setSpaceHeld(true)
      }
    }

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || spaceStartRef.current === null) return
      e.preventDefault()
      const startTime = spaceStartRef.current
      spaceStartRef.current = null
      setSpaceHeld(false)
      const endTime = getTime()
      if (endTime > startTime + 0.05 && selectedIdsRef.current.length > 0) {
        const round = (n: number) => Math.round(n * 100) / 100
        const news = selectedIdsRef.current.map((mid) => ({
          id: uid(),
          memberId: mid,
          startTime: round(startTime),
          endTime: round(endTime),
        }))
        onChange([...segmentsRef.current, ...news].sort((a, b) => a.startTime - b.startTime))
      }
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [getTime, onChange])

  const addSegment = () => {
    const s = Number(start)
    const e = Number(end)
    if (selectedIds.length === 0 || Number.isNaN(s) || Number.isNaN(e) || e <= s) return
    onChange(
      [...segments, ...makeSegments(selectedIds, s, e)].sort((a, b) => a.startTime - b.startTime),
    )
    setStart(end)
    setEnd('')
  }

  const removeSegment = (id: string) => {
    onChange(segments.filter((s) => s.id !== id))
  }

  const updateSegment = (id: string, patch: Partial<Segment>) => {
    onChange(
      segments
        .map((s) => (s.id === id ? { ...s, ...patch } : s))
        .sort((a, b) => a.startTime - b.startTime),
    )
  }

  const toggleRecord = () => {
    if (selectedIds.length === 0) return
    if (recording) {
      const endTime = getTime()
      if (endTime > recording.startTime) {
        onChange(
          [...segments, ...makeSegments(recording.memberIds, recording.startTime, endTime)].sort(
            (a, b) => a.startTime - b.startTime,
          ),
        )
      }
      setRecording(null)
    } else {
      setRecording({ memberIds: selectedIds, startTime: getTime() })
    }
  }

  const sorted = [...segments].sort((a, b) => a.startTime - b.startTime)

  return (
    <div className="flex flex-col gap-3">
      <fieldset className="flex flex-col gap-2">
        <legend className="text-xs font-medium text-muted-foreground">
          Quem canta? (toque para selecionar um ou mais)
        </legend>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Membros do segmento">
          {members.map((m) => {
            const active = selectedIds.includes(m.id)
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => toggleMember(m.id)}
                aria-pressed={active}
                className={`flex min-h-11 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-all duration-200 ease-in-out hover:-translate-y-0.5 md:min-h-0 md:px-2.5 ${
                  active
                    ? 'border-transparent text-background shadow-md'
                    : 'border-border bg-card text-foreground hover:bg-secondary'
                }`}
                style={active ? { backgroundColor: m.color } : undefined}
              >
                <span
                  className="size-2.5 rounded-full"
                  style={{ backgroundColor: active ? 'rgba(0,0,0,0.35)' : m.color }}
                  aria-hidden="true"
                />
                {m.name}
              </button>
            )
          })}
          {members.length === 0 && (
            <span className="text-xs text-muted-foreground">
              Adicione membros na aba Membros primeiro.
            </span>
          )}
        </div>
        <Button
          size="sm"
          variant={recording ? 'destructive' : 'secondary'}
          onClick={toggleRecord}
          disabled={selectedIds.length === 0}
          title="Marca início/fim usando o tempo atual do player"
          className="min-h-11 self-start md:min-h-0"
        >
          <CircleDot className="size-4" />
          {recording ? `Finalizar (${fmt(recording.startTime)}s → agora)` : 'Gravar ao vivo'}
        </Button>
      </fieldset>

      <div
        className={`flex items-center gap-2 rounded-md border px-3 py-2 text-xs transition-colors ${
          spaceHeld
            ? 'border-primary bg-primary/15 text-primary'
            : 'border-border bg-card text-muted-foreground'
        }`}
        role="status"
        aria-live="polite"
      >
        <Keyboard className="size-4 shrink-0" />
        {spaceHeld ? (
          <span className="font-semibold">
            Gravando {selectedNames || 'membros'}… solte o espaço para finalizar
          </span>
        ) : selectedIds.length > 0 ? (
          <span>
            Segure <kbd className="rounded border border-border bg-secondary px-1 font-mono">Espaço</kbd>{' '}
            durante a música para gravar a parte de{' '}
            <strong className="text-foreground">{selectedNames}</strong>
          </span>
        ) : (
          <span>Selecione um ou mais membros acima para gravar com a tecla Espaço</span>
        )}
      </div>

      <div className="flex items-center gap-2">
        <input
          type="number"
          min={0}
          step={0.1}
          value={start}
          onChange={(e) => setStart(e.target.value)}
          placeholder="Início (s)"
          className="h-11 w-24 min-w-0 flex-1 rounded-md border border-input bg-transparent px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring md:h-9 md:flex-none"
          aria-label="Tempo de início em segundos"
        />
        <input
          type="number"
          min={0}
          step={0.1}
          value={end}
          onChange={(e) => setEnd(e.target.value)}
          placeholder="Fim (s)"
          className="h-11 w-24 min-w-0 flex-1 rounded-md border border-input bg-transparent px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring md:h-9 md:flex-none"
          aria-label="Tempo de fim em segundos"
        />
        <Button
          size="sm"
          className="h-11 shrink-0 md:h-8"
          onClick={addSegment}
          disabled={selectedIds.length === 0 || !start || !end}
          aria-label="Adicionar segmento"
        >
          <Plus className="size-4" />
          <span className="hidden md:inline-block">Segmento</span>
        </Button>
      </div>

      {sorted.length === 0 && (
        <p className="rounded-md border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
          Nenhum segmento. Defina quem canta em qual momento da música.
        </p>
      )}

      <ul className="flex max-h-72 flex-col gap-1.5 overflow-y-auto pr-1">
        {sorted.map((s) => {
          const m = memberById(s.memberId)
          return (
            <li
              key={s.id}
              className="flex flex-col gap-1.5 rounded-md border border-border bg-card px-2 py-2.5 text-sm transition-all duration-200 ease-in-out animate-in fade-in slide-in-from-top-1 hover:border-primary/40 hover:bg-secondary/60 md:py-1.5"
            >
              {/* Mobile: controles com rolagem horizontal própria (touch-pan-x)
                  para não empurrar a página; hitboxes ≥44px para o dedo */}
              <div className="flex touch-pan-x items-center gap-2 overflow-x-auto md:overflow-x-visible">
                <span
                  className="size-3 shrink-0 rounded-full"
                  style={{ backgroundColor: m?.color ?? '#888' }}
                  aria-hidden="true"
                />
                <span className="min-w-16 flex-1 truncate font-medium md:min-w-0">
                  {m?.name ?? 'Membro removido'}
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={!!s.isAdlib}
                  onClick={() => updateSegment(s.id, { isAdlib: !s.isAdlib || undefined })}
                  title="Ad-lib: vocal de apoio, aparece em área secundária no vídeo"
                  className={`flex min-h-11 shrink-0 items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold transition-colors md:min-h-0 md:px-2 ${
                    s.isAdlib
                      ? 'border-primary bg-primary/20 text-primary'
                      : 'border-border text-muted-foreground hover:bg-secondary'
                  }`}
                >
                  <Music className="size-3" aria-hidden="true" />
                  <span className="hidden md:inline-block">Ad-lib</span>
                </button>
                <input
                  type="number"
                  min={0}
                  step={0.1}
                  value={s.startTime}
                  onChange={(e) => updateSegment(s.id, { startTime: Number(e.target.value) })}
                  className="h-11 w-20 shrink-0 rounded border border-input bg-transparent px-1.5 text-xs outline-none md:h-7"
                  aria-label="Início"
                />
                <span className="shrink-0 text-muted-foreground">→</span>
                <input
                  type="number"
                  min={0}
                  step={0.1}
                  value={s.endTime}
                  onChange={(e) => updateSegment(s.id, { endTime: Number(e.target.value) })}
                  className="h-11 w-20 shrink-0 rounded border border-input bg-transparent px-1.5 text-xs outline-none md:h-7"
                  aria-label="Fim"
                />
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-11 shrink-0 md:size-7"
                  onClick={() => removeSegment(s.id)}
                  aria-label="Remover segmento"
                >
                  <Trash2 className="size-3.5 text-destructive" />
                </Button>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
