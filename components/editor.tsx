'use client'

import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ImageIcon, Music, RectangleHorizontal, RectangleVertical } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Logo } from '@/components/logo'
import { LyricsPanel } from '@/components/lyrics-panel'
import { MembersPanel } from '@/components/members-panel'
import { PreviewCanvas, type PreviewHandle } from '@/components/preview-canvas'
import { ThemeSwitcher } from '@/components/theme-switcher'
import { TimelinePanel } from '@/components/timeline-panel'
import { getAudioUrlCloud, uploadAudioCloud, upsertProjectCloud } from '@/lib/cloud-storage'
import { compressImage } from '@/lib/image-utils'
import type { Group, Member, Project, Segment } from '@/lib/types'

interface EditorProps {
  initialProject: Project
  groups?: Group[]
  userId: string
  onBack: () => void
}

type Tab = 'info' | 'members' | 'timeline' | 'lyrics'

export function Editor({ initialProject, groups = [], userId, onBack }: EditorProps) {
  const [project, setProject] = useState<Project>(initialProject)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [uploadingAudio, setUploadingAudio] = useState(false)
  const [tab, setTab] = useState<Tab>('info')
  const previewRef = useRef<PreviewHandle>(null)
  const coverInputRef = useRef<HTMLInputElement>(null)
  const audioInputRef = useRef<HTMLInputElement>(null)

  // Carrega o áudio do Supabase Storage (URL assinada) ao abrir
  useEffect(() => {
    if (!initialProject.hasAudio) return
    let cancelled = false
    void getAudioUrlCloud(userId, initialProject.id).then((url) => {
      if (!cancelled && url) setAudioUrl(url)
    })
    return () => {
      cancelled = true
    }
  }, [initialProject.id, initialProject.hasAudio, userId])

  // Auto-save com debounce na nuvem
  const isFirstRender = useRef(true)
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }
    const timer = setTimeout(() => {
      void upsertProjectCloud({ ...project, updatedAt: Date.now() }, userId).catch((e) =>
        console.error('Falha ao salvar projeto na nuvem', e),
      )
    }, 800)
    return () => clearTimeout(timer)
  }, [project, userId])

  const patch = (p: Partial<Project>) => setProject((prev) => ({ ...prev, ...p }))

  const handleCover = async (file: File | undefined) => {
    if (!file) return
    try {
      const coverImage = await compressImage(file) // 150x150 jpeg 0.6
      patch({ coverImage })
    } catch (e) {
      console.error('Falha ao comprimir capa', e)
    }
  }

  const handleAudio = async (file: File | undefined) => {
    if (!file) return
    // Preview local imediato enquanto o upload acontece em segundo plano
    if (audioUrl?.startsWith('blob:')) URL.revokeObjectURL(audioUrl)
    setAudioUrl(URL.createObjectURL(file))
    patch({ hasAudio: true, audioName: file.name })
    setUploadingAudio(true)
    try {
      await uploadAudioCloud(userId, project.id, file)
    } catch (e) {
      console.error('Falha ao enviar áudio para a nuvem', e)
    } finally {
      setUploadingAudio(false)
    }
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'info', label: 'Informações' },
    { id: 'members', label: `Membros (${project.members.length})` },
    { id: 'timeline', label: `Timeline (${project.segments.length})` },
    { id: 'lyrics', label: 'Letras' },
  ]

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex items-center gap-3 border-b border-border px-4 py-3">
        <Button size="icon" variant="ghost" onClick={onBack} aria-label="Voltar ao dashboard">
          <ArrowLeft className="size-4" />
        </Button>
        <Logo className="size-8 shrink-0" />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm font-semibold">{project.title || 'Sem título'}</h1>
          <p className="truncate text-xs text-muted-foreground">
            {project.artist || 'Artista'} · salvo automaticamente
          </p>
        </div>
        <ThemeSwitcher />
      </header>

      {/* Mobile: página inteira rola (flex-col) com player fixo no topo.
          Desktop: layout lado a lado com scroll apenas nos painéis. */}
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-3 pb-24 md:flex-row md:overflow-hidden md:p-4 md:pb-4">
        {/* Preview — sticky no mobile: sempre visível ao rolar a timeline */}
        <div className="sticky top-0 z-50 -mx-3 -mt-3 h-[46dvh] shrink-0 bg-background/95 px-3 pt-2 pb-2 backdrop-blur-sm md:static md:z-auto md:mx-0 md:mt-0 md:flex md:h-auto md:min-h-0 md:min-w-0 md:flex-1 md:shrink md:justify-center md:bg-transparent md:p-0 md:backdrop-blur-none">
          <PreviewCanvas ref={previewRef} project={project} audioUrl={audioUrl} />
        </div>

        {/* Painéis: abas logo abaixo do vídeo no mobile, sidebar no desktop */}
        <aside className="flex w-full flex-col gap-3 md:w-[360px] md:shrink-0 md:overflow-y-auto">
          <div className="flex gap-1 rounded-lg bg-secondary p-1" role="tablist">
            {tabs.map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
                className={`min-h-11 flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-all duration-200 ease-in-out md:min-h-0 ${
                  tab === t.id
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:bg-background/50 hover:text-foreground'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === 'info' && (
            <div className="flex flex-col gap-3 animate-in fade-in slide-in-from-top-1 duration-200">
              <fieldset className="flex flex-col gap-1.5">
                <legend className="text-xs font-medium text-muted-foreground">
                  Formato do vídeo
                </legend>
                <div className="flex gap-1.5" role="group" aria-label="Formato do vídeo">
                  <button
                    type="button"
                    onClick={() => patch({ format: 'vertical' })}
                    aria-pressed={(project.format ?? 'vertical') === 'vertical'}
                    className={`flex flex-1 items-center justify-center gap-2 rounded-md border px-3 py-2 text-xs font-medium transition-colors ${
                      (project.format ?? 'vertical') === 'vertical'
                        ? 'border-primary bg-primary/15 text-primary'
                        : 'border-border bg-card text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <RectangleVertical className="size-4" />
                    9:16 · TikTok / Shorts
                  </button>
                  <button
                    type="button"
                    onClick={() => patch({ format: 'horizontal' })}
                    aria-pressed={project.format === 'horizontal'}
                    className={`flex flex-1 items-center justify-center gap-2 rounded-md border px-3 py-2 text-xs font-medium transition-colors ${
                      project.format === 'horizontal'
                        ? 'border-primary bg-primary/15 text-primary'
                        : 'border-border bg-card text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <RectangleHorizontal className="size-4" />
                    16:9 · YouTube
                  </button>
                </div>
              </fieldset>

              <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
                Título da música
                <input
                  value={project.title}
                  onChange={(e) => patch({ title: e.target.value })}
                  className="h-9 rounded-md border border-input bg-transparent px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
                Artista / Grupo
                <input
                  value={project.artist}
                  onChange={(e) => patch({ artist: e.target.value })}
                  className="h-9 rounded-md border border-input bg-transparent px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </label>

              <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
                {project.coverImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={project.coverImage}
                    alt="Capa do projeto"
                    className="size-14 rounded-md object-cover"
                  />
                ) : (
                  <span className="flex size-14 items-center justify-center rounded-md bg-secondary">
                    <ImageIcon className="size-5 text-muted-foreground" />
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">Capa</p>
                  <p className="text-xs text-muted-foreground">Vira o fundo com blur do vídeo</p>
                </div>
                <Button size="sm" variant="secondary" onClick={() => coverInputRef.current?.click()}>
                  Enviar
                </Button>
                <input
                  ref={coverInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => void handleCover(e.target.files?.[0])}
                />
              </div>

              <fieldset className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3">
                <legend className="px-1 text-xs font-medium text-muted-foreground">
                  Opções de Vídeo · Cinematic
                </legend>
                <label className="flex items-center justify-between gap-3">
                  <span className="text-sm">
                    Ativar Intro (3s)
                    <span className="block text-xs text-muted-foreground">
                      Título e grupo antes da música começar
                    </span>
                  </span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={!!project.introEnabled}
                    aria-label="Ativar Intro (3s)"
                    onClick={() => patch({ introEnabled: !project.introEnabled })}
                    className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                      project.introEnabled ? 'bg-primary' : 'bg-secondary'
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 size-5 rounded-full bg-background transition-[left] ${
                        project.introEnabled ? 'left-[22px]' : 'left-0.5'
                      }`}
                    />
                  </button>
                </label>
                <label className="flex items-center justify-between gap-3">
                  <span className="text-sm">
                    Ativar Outro (3s)
                    <span className="block text-xs text-muted-foreground">
                      Tela de encerramento após o ranking
                    </span>
                  </span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={!!project.outroEnabled}
                    aria-label="Ativar Outro (3s)"
                    onClick={() => patch({ outroEnabled: !project.outroEnabled })}
                    className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                      project.outroEnabled ? 'bg-primary' : 'bg-secondary'
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 size-5 rounded-full bg-background transition-[left] ${
                        project.outroEnabled ? 'left-[22px]' : 'left-0.5'
                      }`}
                    />
                  </button>
                </label>
                {project.outroEnabled && (
                  <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
                    Texto de Encerramento
                    <input
                      value={project.outroText ?? ''}
                      onChange={(e) => patch({ outroText: e.target.value })}
                      placeholder="Thanks for watching!"
                      className="h-9 rounded-md border border-input bg-transparent px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                  </label>
                )}
              </fieldset>

              <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
                <span className="flex size-14 items-center justify-center rounded-md bg-secondary">
                  <Music className="size-5 text-muted-foreground" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">Áudio</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {uploadingAudio
                      ? 'Enviando para a nuvem…'
                      : (project.audioName ?? 'Nenhum arquivo')}
                  </p>
                </div>
                <Button size="sm" variant="secondary" onClick={() => audioInputRef.current?.click()}>
                  Enviar
                </Button>
                <input
                  ref={audioInputRef}
                  type="file"
                  accept="audio/*"
                  className="hidden"
                  onChange={(e) => void handleAudio(e.target.files?.[0])}
                />
              </div>
            </div>
          )}

          {tab === 'members' && (
            <div className="animate-in fade-in slide-in-from-top-1 duration-200">
              <MembersPanel
                members={project.members}
                groups={groups}
                onChange={(members: Member[]) => patch({ members })}
              />
            </div>
          )}

          {tab === 'timeline' && (
            <div className="animate-in fade-in slide-in-from-top-1 duration-200">
              <TimelinePanel
                members={project.members}
                segments={project.segments}
                onChange={(segments: Segment[]) => patch({ segments })}
                getTime={() => previewRef.current?.getTime() ?? 0}
              />
            </div>
          )}

          {tab === 'lyrics' && (
            <div className="animate-in fade-in slide-in-from-top-1 duration-200">
              <LyricsPanel
                members={project.members}
                segments={project.segments}
                onChange={(segments: Segment[]) => patch({ segments })}
              />
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}
