'use client'

import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Circle,
  Eye,
  Palette,
  RotateCcw,
  Square,
  Squircle,
  Type,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DEFAULT_DESIGN,
  type AvatarShape,
  type DesignSettings,
  type LyricPosition,
  type VideoFont,
} from '@/lib/types'

interface DesignPanelProps {
  design: Partial<DesignSettings> | undefined
  onChange: (design: Partial<DesignSettings>) => void
}

const FONT_OPTIONS: { id: VideoFont; label: string; sample: string }[] = [
  { id: 'default', label: 'Padrão', sample: 'Outfit / Unbounded' },
  { id: 'sans', label: 'Sans', sample: 'Inter' },
  { id: 'serif', label: 'Serif', sample: 'Playfair Display' },
  { id: 'impact', label: 'Impact', sample: 'Impact' },
  { id: 'mono', label: 'Mono', sample: 'Courier New' },
]

const FONT_PREVIEW: Record<VideoFont, string> = {
  default: 'Outfit, sans-serif',
  sans: "Inter, 'Segoe UI', system-ui, sans-serif",
  serif: "'Playfair Display', Georgia, serif",
  impact: "Impact, 'Arial Black', sans-serif",
  mono: "'Courier New', ui-monospace, monospace",
}

const SHAPE_OPTIONS: { id: AvatarShape; label: string; icon: typeof Circle }[] = [
  { id: 'circle', label: 'Círculo', icon: Circle },
  { id: 'rounded', label: 'Arredondado', icon: Squircle },
  { id: 'square', label: 'Quadrado', icon: Square },
]

const POSITION_OPTIONS: { id: LyricPosition | 'auto'; label: string; icon?: typeof AlignLeft }[] = [
  { id: 'auto', label: 'Auto' },
  { id: 'left', label: 'Esquerda', icon: AlignLeft },
  { id: 'center', label: 'Centro', icon: AlignCenter },
  { id: 'right', label: 'Direita', icon: AlignRight },
]

export function DesignPanel({ design, onChange }: DesignPanelProps) {
  // Configuração efetiva: padrões + overrides salvos no projeto
  const d: DesignSettings = { ...DEFAULT_DESIGN, ...design }

  const set = (patch: Partial<DesignSettings>) => onChange({ ...design, ...patch })

  const isDirty = !!design && Object.keys(design).length > 0

  return (
    <div className="flex flex-col gap-3 animate-in fade-in slide-in-from-top-1 duration-200">
      {/* ---------- Tipografia ---------- */}
      <fieldset className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3">
        <legend className="flex items-center gap-1.5 px-1 text-xs font-medium text-muted-foreground">
          <Type className="size-3.5" aria-hidden="true" />
          Tipografia
        </legend>
        <div className="flex flex-col gap-1.5" role="radiogroup" aria-label="Fonte do vídeo">
          {FONT_OPTIONS.map((f) => (
            <button
              key={f.id}
              type="button"
              role="radio"
              aria-checked={d.font === f.id}
              onClick={() => set({ font: f.id })}
              className={`flex items-center justify-between rounded-md border px-3 py-2 text-left transition-colors ${
                d.font === f.id
                  ? 'border-primary bg-primary/15 text-primary'
                  : 'border-border bg-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <span className="text-xs font-medium">{f.label}</span>
              <span
                className={`text-sm ${d.font === f.id ? 'text-primary' : 'text-foreground'}`}
                style={{ fontFamily: FONT_PREVIEW[f.id] }}
              >
                {f.sample}
              </span>
            </button>
          ))}
        </div>

        <label className="mt-1 flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          <span className="flex items-center justify-between">
            Tamanho das Letras
            <span className="tabular-nums text-foreground">{Math.round(d.lyricScale * 100)}%</span>
          </span>
          <input
            type="range"
            min={0.8}
            max={1.5}
            step={0.05}
            value={d.lyricScale}
            onChange={(e) => set({ lyricScale: Number(e.target.value) })}
            className="accent-primary"
            aria-label="Tamanho das letras no vídeo"
          />
        </label>
      </fieldset>

      {/* ---------- Avatares e barras ---------- */}
      <fieldset className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3">
        <legend className="flex items-center gap-1.5 px-1 text-xs font-medium text-muted-foreground">
          <Palette className="size-3.5" aria-hidden="true" />
          Avatares e Barras
        </legend>
        <div className="flex gap-1.5" role="radiogroup" aria-label="Formato dos avatares">
          {SHAPE_OPTIONS.map((s) => {
            const Icon = s.icon
            return (
              <button
                key={s.id}
                type="button"
                role="radio"
                aria-checked={d.avatarShape === s.id}
                onClick={() => set({ avatarShape: s.id })}
                className={`flex flex-1 flex-col items-center gap-1 rounded-md border px-2 py-2 text-xs font-medium transition-colors ${
                  d.avatarShape === s.id
                    ? 'border-primary bg-primary/15 text-primary'
                    : 'border-border bg-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                <Icon className="size-4" aria-hidden="true" />
                {s.label}
              </button>
            )
          })}
        </div>

        <label className="mt-1 flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          <span className="flex items-center justify-between">
            Espessura das barras
            <span className="tabular-nums text-foreground">{d.barThickness} / 10</span>
          </span>
          <input
            type="range"
            min={1}
            max={10}
            step={1}
            value={d.barThickness}
            onChange={(e) => set({ barThickness: Number(e.target.value) })}
            className="accent-primary"
            aria-label="Espessura das barras de progresso"
          />
        </label>
      </fieldset>

      {/* ---------- Posição das letras ---------- */}
      <fieldset className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3">
        <legend className="px-1 text-xs font-medium text-muted-foreground">
          Posição das Letras
        </legend>
        <div className="flex gap-1.5" role="radiogroup" aria-label="Posição das letras">
          {POSITION_OPTIONS.map((p) => {
            const Icon = p.icon
            return (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={d.lyricPosition === p.id}
                onClick={() => set({ lyricPosition: p.id })}
                className={`flex flex-1 flex-col items-center gap-1 rounded-md border px-2 py-2 text-xs font-medium transition-colors ${
                  d.lyricPosition === p.id
                    ? 'border-primary bg-primary/15 text-primary'
                    : 'border-border bg-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                {Icon ? <Icon className="size-4" aria-hidden="true" /> : <span className="size-4 text-center leading-4">A</span>}
                {p.label}
              </button>
            )
          })}
        </div>
        <p className="text-xs text-muted-foreground">
          &quot;Auto&quot; usa o padrão do formato: centro no 9:16 e direita no 16:9.
        </p>
      </fieldset>

      {/* ---------- Visibilidade ---------- */}
      <fieldset className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3">
        <legend className="flex items-center gap-1.5 px-1 text-xs font-medium text-muted-foreground">
          <Eye className="size-3.5" aria-hidden="true" />
          Elementos Visíveis
        </legend>
        {(
          [
            { key: 'showCover', label: 'Capa do álbum', hint: 'Miniatura no topo do vídeo' },
            { key: 'showLabel', label: 'Selo "LINE DISTRIBUTION"', hint: 'Texto acima do título' },
            { key: 'showTimes', label: 'Tempos numéricos', hint: 'Segundos ao lado das barras' },
          ] as const
        ).map((opt) => (
          <label key={opt.key} className="flex items-center justify-between gap-3">
            <span className="text-sm">
              {opt.label}
              <span className="block text-xs text-muted-foreground">{opt.hint}</span>
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={d[opt.key]}
              aria-label={opt.label}
              onClick={() => set({ [opt.key]: !d[opt.key] })}
              className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                d[opt.key] ? 'bg-primary' : 'bg-secondary'
              }`}
            >
              <span
                className={`absolute top-0.5 size-5 rounded-full bg-background transition-[left] ${
                  d[opt.key] ? 'left-[22px]' : 'left-0.5'
                }`}
              />
            </button>
          </label>
        ))}
      </fieldset>

      <Button
        size="sm"
        variant="ghost"
        disabled={!isDirty}
        onClick={() => onChange({})}
        className="self-start text-muted-foreground"
      >
        <RotateCcw className="size-4" />
        Restaurar padrões
      </Button>
    </div>
  )
}
