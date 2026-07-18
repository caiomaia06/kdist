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
import {
  createElementAnalyser,
  readFrequency,
  type AnalyserHandle,
} from '@/lib/audio-visualizer'
import { loadImage } from '@/lib/image-utils'
import {
  buildBackgroundCache,
  computeTotals,
  drawVideoFrame,
  videoDims,
  videoTiming,
  type MemberRenderState,
} from '@/lib/renderer'
import { downloadVideo, startVideoExport, type ExportController } from '@/lib/video-export'
import type { Project } from '@/lib/types'

export interface PreviewHandle {
  getTime: () => number
  /** Alterna Play/Pause — usado pelo atalho global de teclado (Espaço). */
  togglePlay: () => void
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
    const analyserRef = useRef<AnalyserHandle | null>(null)

    const [playing, setPlaying] = useState(false)
    const playingRef = useRef(false)
    const [time, setTime] = useState(0)
    const [duration, setDuration] = useState(project.duration ?? 0)
    const [exporting, setExporting] = useState(false)
    const [exportProgress, setExportProgress] = useState(0)

    // Máquina de estados do relógio de VÍDEO:
    // 'intro'/'ranking'/'outro' rodam num relógio próprio (performance.now);
    // 'main' usa o currentTime do áudio como fonte única de verdade (zero drift).
    const phaseRef = useRef<'intro' | 'main' | 'ranking' | 'outro'>('main')
    const phaseStartRef = useRef(0) // performance.now (ms) do início da fase
    const videoTimeRef = useRef(0) // tempo de vídeo atual (inclui intro/outro)

    const totals = useMemo(() => computeTotals(project), [project])
    const projectRef = useRef(project)
    projectRef.current = project
    const totalsRef = useRef(totals)
    totalsRef.current = totals
    const durationRef = useRef(duration)
    durationRef.current = duration

    // Duração total do vídeo = áudio + intro (3s) + outro (3s), se ativos
    const timing = videoTiming(project, duration)

    const dims = videoDims(project.format)

    useImperativeHandle(ref, () => ({
      getTime: () => audioRef.current?.currentTime ?? 0,
      togglePlay: () => {
        if (!exporting) togglePlay()
      },
    }))

    // Renderiza no tempo de VÍDEO vt (intro/outro inclusos na linha do tempo)
    const renderAt = useCallback((vt: number) => {
      const canvas = canvasRef.current
      const cache = cacheRef.current
      if (!canvas || !cache) return
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      drawVideoFrame(
        ctx,
        cache,
        projectRef.current,
        avatarsRef.current,
        statesRef.current,
        totalsRef.current,
        vt,
        durationRef.current || 0,
        // Espectro em tempo real: só na fase MAIN com áudio tocando
        analyserRef.current && playingRef.current && phaseRef.current === 'main'
          ? readFrequency(analyserRef.current)
          : undefined,
      )
    }, [])

    /**
     * Sincroniza a máquina de estados + o áudio para um tempo de vídeo vt.
     * Se `play` for true, retoma a reprodução a partir dali.
     */
    const syncToVideoTime = useCallback((vt: number, play: boolean) => {
      const audio = audioRef.current
      if (!audio) return
      const t = videoTiming(projectRef.current, durationRef.current)
      videoTimeRef.current = vt

      if (vt < t.introDur) {
        phaseRef.current = 'intro'
        phaseStartRef.current = performance.now() - vt * 1000
        audio.pause() // o áudio só entra quando a intro terminar
        audio.currentTime = 0
      } else if (vt < t.introDur + t.mainDur) {
        phaseRef.current = 'main'
        audio.currentTime = vt - t.introDur
        if (play) void audio.play()
        else audio.pause()
      } else if (vt < t.introDur + t.mainDur + t.rankingDur) {
        phaseRef.current = 'ranking'
        phaseStartRef.current = performance.now() - (vt - t.introDur - t.mainDur) * 1000
        audio.pause()
      } else {
        phaseRef.current = 'outro'
        phaseStartRef.current =
          performance.now() - (vt - t.introDur - t.mainDur - t.rankingDur) * 1000
        audio.pause()
      }
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
        renderAt(videoTimeRef.current)
      }
      void build()
      return () => {
        cancelled = true
      }
    }, [project, renderAt])

    // Loop de preview (rAF) — máquina de estados INTRO → MAIN → RANKING → OUTRO.
    // A UI é atualizada com throttle; o tempo de VÍDEO é a linha do tempo.
    useEffect(() => {
      if (!playing || exporting) return
      let lastUi = 0
      const loop = () => {
        const audio = audioRef.current
        const t = videoTiming(projectRef.current, durationRef.current)
        let vt = videoTimeRef.current

        if (phaseRef.current === 'intro') {
          vt = (performance.now() - phaseStartRef.current) / 1000
          if (vt >= t.introDur) {
            // Intro acabou: o áudio começa a tocar AGORA (delay de 3s cumprido)
            phaseRef.current = 'main'
            if (audio) {
              audio.currentTime = 0
              void audio.play()
            }
            vt = t.introDur
          }
        } else if (phaseRef.current === 'main') {
          // O currentTime do áudio é a única fonte de verdade — zero drift
          vt = t.introDur + (audio?.currentTime ?? 0)
          if (vt >= t.introDur + t.mainDur - 0.02) {
            // MAIN terminou (áudio acabou ou silêncio final cortado):
            // entra a fase RANKING de 5s com relógio próprio
            phaseRef.current = 'ranking'
            phaseStartRef.current = performance.now()
            audio?.pause()
            vt = t.introDur + t.mainDur
          }
        } else if (phaseRef.current === 'ranking') {
          vt = t.introDur + t.mainDur + (performance.now() - phaseStartRef.current) / 1000
          if (vt >= t.introDur + t.mainDur + t.rankingDur) {
            if (t.outroDur > 0) {
              phaseRef.current = 'outro'
              phaseStartRef.current = performance.now()
              vt = t.introDur + t.mainDur + t.rankingDur
            } else {
              videoTimeRef.current = t.totalDur
              renderAt(t.totalDur)
              setTime(t.totalDur)
              playingRef.current = false
              setPlaying(false)
              return
            }
          }
        } else {
          // outro: relógio próprio após o ranking
          vt =
            t.introDur + t.mainDur + t.rankingDur + (performance.now() - phaseStartRef.current) / 1000
          if (vt >= t.totalDur) {
            videoTimeRef.current = t.totalDur
            renderAt(t.totalDur)
            setTime(t.totalDur)
            playingRef.current = false
            setPlaying(false)
            return
          }
        }

        videoTimeRef.current = vt
        renderAt(vt)
        const now = performance.now()
        if (now - lastUi > 250) {
          lastUi = now
          setTime(vt)
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
        // Web Audio precisa de gesto do usuário: conecta o analyser aqui
        try {
          analyserRef.current = createElementAnalyser(audio)
        } catch {
          analyserRef.current = null // visualizador é opcional, áudio segue normal
        }
        // No fim do vídeo, o Play recomeça do zero (incluindo a intro)
        const t = videoTiming(projectRef.current, durationRef.current)
        const vt = videoTimeRef.current >= t.totalDur - 0.05 ? 0 : videoTimeRef.current
        syncToVideoTime(vt, true)
        playingRef.current = true
        setPlaying(true)
      }
    }

    const seek = (vt: number) => {
      const audio = audioRef.current
      if (!audio) return
      syncToVideoTime(vt, playingRef.current)
      setTime(vt)
      statesRef.current.clear()
      renderAt(vt)
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
        renderAt(videoTimeRef.current)
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
      <div className="flex h-full w-full min-w-0 flex-col items-center gap-2 md:gap-3">
        <div
          className={`relative mx-auto flex min-h-0 max-w-full items-center justify-center overflow-hidden rounded-xl border border-border bg-black ${
            project.format === 'horizontal' ? 'w-full flex-1 md:flex-none' : 'flex-1'
          }`}
        >
          <canvas
            key={project.format ?? 'vertical'}
            ref={canvasRef}
            width={dims.W}
            height={dims.H}
            className={
              project.format === 'horizontal'
                ? 'h-auto max-h-full w-full max-w-full'
                : 'h-full w-auto max-w-full object-contain'
            }
            style={{ aspectRatio: project.format === 'horizontal' ? '16 / 9' : '9 / 16' }}
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
            // Áudio acabou: se ainda estamos em MAIN, o loop rAF fará a
            // transição para RANKING (currentTime fica travado no fim).
            // Se há ranking ou outro pela frente, o vídeo continua sozinho.
            const t = videoTiming(projectRef.current, durationRef.current)
            if (playingRef.current && (t.rankingDur > 0 || t.outroDur > 0)) return
            playingRef.current = false
            setPlaying(false)
          }}
          crossOrigin="anonymous"
        />

        <div className="flex w-full max-w-xl items-center gap-2 md:gap-3">
          <Button
            size="icon"
            variant="secondary"
            onClick={togglePlay}
            disabled={!canPlay || exporting}
            aria-label={playing ? 'Pausar' : 'Reproduzir'}
          >
            {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
          </Button>
          <span className="w-10 text-right font-mono text-xs text-muted-foreground md:w-12">
            {formatTime(time)}
          </span>
          <input
            type="range"
            min={0}
            max={timing.totalDur || 1}
            step={0.05}
            value={Math.min(time, timing.totalDur || 1)}
            onChange={(e) => seek(Number(e.target.value))}
            disabled={!canPlay || exporting}
            className="min-w-0 flex-1 accent-primary"
            aria-label="Posição do v��deo"
          />
          <span className="w-10 font-mono text-xs text-muted-foreground md:w-12">
            {formatTime(timing.totalDur)}
          </span>
          <Button
            onClick={startExport}
            disabled={!canPlay || exporting || !duration}
            aria-label="Exportar vídeo"
          >
            <Download className="size-4" />
            <span className="hidden md:inline-block">Exportar</span>
          </Button>
        </div>
      </div>
    )
  },
)
