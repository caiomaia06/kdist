'use client'

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react'
import { Download, Pause, Play, Square, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { loadImage } from '@/lib/image-utils'
import {
  buildBackgroundCache,
  computeTotals,
  drawFrame,
  VIDEO_H,
  VIDEO_W,
  type MemberRenderState,
} from '@/lib/renderer'
import { downloadVideo, startVideoExport, type ExportController } from '@/lib/video-export'
import type { Project } from '@/lib/types'

export interface PreviewHandle {
  getTime: () => number
}

interface PreviewCanvasProps {
  project: Project
  audioUrl: string | null
}

function formatTime(s: number): string {
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}

export const PreviewCanvas = forwardRef<PreviewHandle, PreviewCanvasProps>(
  function PreviewCanvas({ project, audioUrl }, ref) {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const audioRef = useRef<HTMLAudioElement>(null)
    const cacheRef = useRef<HTMLCanvasElement | null>(null)
    const avatarsRef = useRef<Map<string, HTMLImageElement>>(new Map())
    const statesRef = useRef<Map<string, MemberRenderState>>(new Map())
    const rafRef = useRef<number>(0)
    const exportRef = useRef<ExportController | null>(null)

    const [playing, setPlaying] = useState(false)
    const playingRef = useRef(false)
    const [time, setTime] = useState(0)
    const [duration, setDuration] = useState(project.duration ?? 0)
    const [exporting, setExporting] = useState(false)
    const [exportProgress, setExportProgress] = useState(0)

    const totals = useMemo(() => computeTotals(project), [project])
    const projectRef = useRef(project)
    projectRef.current = project
    const totalsRef = useRef(totals)
    totalsRef.current = totals

    useImperativeHandle(ref, () => ({
      getTime: () => audioRef.current?.currentTime ?? 0,
    }))

    const renderAt = useCallback((t: number) => {
      const canvas = canvasRef.current
      const cache = cacheRef.current
      if (!canvas || !cache) return
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      drawFrame(
        ctx,
        cache,
        projectRef.current,
        avatarsRef.current,
        statesRef.current,
        totalsRef.current,
        t,
      )
    }, [])

    // (Re)constrói o cache de fundo e os avatares quando o projeto muda
    useEffect(() => {
      let cancelled = false
      async function build() {
        const cover = project.coverImage ? await loadImage(project.coverImage).catch(() => null) : null
        if (cancelled) return
        cacheRef.current = buildBackgroundCache(project, cover)

        const map = new Map<string, HTMLImageElement>()
        await Promise.all(
          project.members
            .filter((m) => m.avatar)
            .map(async (m) => {
              const img = await loadImage(m.avatar!).catch(() => null)
              if (img) map.set(m.id, img)
            }),
        )
        if (cancelled) return
        avatarsRef.current = map
        // Parado: limpa os estados de lerp para as posições irem direto ao alvo
        if (!playingRef.current) statesRef.current.clear()
        renderAt(audioRef.current?.currentTime ?? 0)
      }
      void build()
      return () => {
        cancelled = true
      }
    }, [project, renderAt])

    // Loop de preview (rAF) — atualização de UI com throttle
    useEffect(() => {
      if (!playing || exporting) return
      let lastUi = 0
      const loop = () => {
        const t = audioRef.current?.currentTime ?? 0
        renderAt(t)
        const now = performance.now()
        if (now - lastUi > 250) {
          lastUi = now
          setTime(t)
        }
        rafRef.current = requestAnimationFrame(loop)
      }
      rafRef.current = requestAnimationFrame(loop)
      return () => cancelAnimationFrame(rafRef.current)
    }, [playing, exporting, renderAt])

    const togglePlay = () => {
      const audio = audioRef.current
      if (!audio || !audioUrl) return
      if (playing) {
        audio.pause()
        playingRef.current = false
        setPlaying(false)
      } else {
        void audio.play()
        playingRef.current = true
        setPlaying(true)
      }
    }

    const seek = (t: number) => {
      const audio = audioRef.current
      if (!audio) return
      audio.currentTime = t
      setTime(t)
      statesRef.current.clear()
      renderAt(t)
    }

    // ---------- Exportação (motor isolado em lib/video-export.ts) ----------
    const startExport = async () => {
      const audio = audioRef.current
      if (!audio || !audioUrl || !duration || exportRef.current) return

      // Pausa o preview — a exportação roda 100% offscreen
      audio.pause()
      playingRef.current = false
      setPlaying(false)
      setExporting(true)
      setExportProgress(0)

      // Espelha alguns frames no canvas visível como feedback (barato)
      let lastMirror = 0
      const mirror = (exportCanvas: HTMLCanvasElement) => {
        const now = performance.now()
        if (now - lastMirror < 200) return
        lastMirror = now
        const ctx = canvasRef.current?.getContext('2d')
        ctx?.drawImage(exportCanvas, 0, 0)
      }

      let lastUi = 0
      const controller = startVideoExport(
        projectRef.current,
        audioUrl,
        duration,
        (p) => {
          const now = performance.now()
          if (now - lastUi < 250 && p < 1) return
          lastUi = now
          setExportProgress(p)
        },
        mirror,
      )
      exportRef.current = controller

      try {
        const result = await controller.done
        downloadVideo(result, projectRef.current.title)
      } catch (e) {
        if ((e as Error).message !== 'cancelled') {
          console.error('Falha na exportação do vídeo', e)
        }
      } finally {
        exportRef.current = null
        setExporting(false)
        setExportProgress(0)
        statesRef.current.clear()
        renderAt(audioRef.current?.currentTime ?? 0)
      }
    }

    const cancelExport = () => {
      exportRef.current?.cancel()
    }

    // Cancela exportação em andamento se o componente desmontar
    useEffect(() => {
      return () => exportRef.current?.cancel()
    }, [])

    const canPlay = Boolean(audioUrl)

    return (
      <div className="flex h-full w-full min-w-0 flex-col items-center gap-3">
        <div className="relative mx-auto min-h-0 flex-1 overflow-hidden rounded-xl border border-border bg-black">
          <canvas
            ref={canvasRef}
            width={VIDEO_W}
            height={VIDEO_H}
            className="h-full w-auto"
            style={{ aspectRatio: '9 / 16' }}
            aria-label="Pré-visualização do vídeo de line distribution"
          />
          {exporting && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/70 p-6">
              <p className="font-semibold text-white">Gravando vídeo…</p>
              <div className="h-2 w-full max-w-xs overflow-hidden rounded-full bg-white/20">
                <div
                  className="h-full rounded-full bg-primary transition-[width]"
                  style={{ width: `${Math.round(exportProgress * 100)}%` }}
                />
              </div>
              <p className="text-sm text-white/70">{Math.round(exportProgress * 100)}%</p>
              <div
                className="flex w-full max-w-xs items-start gap-2 rounded-lg border border-amber-400/60 bg-amber-400/15 p-3"
                role="alert"
              >
                <TriangleAlert className="mt-0.5 size-5 shrink-0 text-amber-400" aria-hidden="true" />
                <p className="text-xs font-semibold leading-relaxed text-amber-200 text-pretty">
                  Por favor, não mude de aba nem minimize o navegador durante a exportação para
                  garantir a qualidade do vídeo.
                </p>
              </div>
              <Button variant="secondary" size="sm" onClick={cancelExport}>
                <Square className="size-4" />
                Cancelar
              </Button>
            </div>
          )}
        </div>

        <audio
          ref={audioRef}
          src={audioUrl ?? undefined}
          onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
          onEnded={() => {
            playingRef.current = false
            setPlaying(false)
          }}
          crossOrigin="anonymous"
        />

        <div className="flex w-full max-w-xl items-center gap-3">
          <Button
            size="icon"
            variant="secondary"
            onClick={togglePlay}
            disabled={!canPlay || exporting}
            aria-label={playing ? 'Pausar' : 'Reproduzir'}
          >
            {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
          </Button>
          <span className="w-12 text-right font-mono text-xs text-muted-foreground">
            {formatTime(time)}
          </span>
          <input
            type="range"
            min={0}
            max={duration || 1}
            step={0.05}
            value={Math.min(time, duration || 1)}
            onChange={(e) => seek(Number(e.target.value))}
            disabled={!canPlay || exporting}
            className="min-w-0 flex-1 accent-primary"
            aria-label="Posição do áudio"
          />
          <span className="w-12 font-mono text-xs text-muted-foreground">
            {formatTime(duration)}
          </span>
          <Button onClick={startExport} disabled={!canPlay || exporting || !duration}>
            <Download className="size-4" />
            Exportar
          </Button>
        </div>
      </div>
    )
  },
)
