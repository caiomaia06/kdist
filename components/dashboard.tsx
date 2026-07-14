'use client'

import { useState } from 'react'
import { LogOut, Mic2, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { GroupsSection } from '@/components/groups-section'
import { Logo } from '@/components/logo'
import { uid, type Group, type Project } from '@/lib/types'

interface DashboardProps {
  projects: Project[]
  groups: Group[]
  userEmail?: string | null
  onLogout?: () => void
  onOpen: (project: Project) => void
  onCreate: (project: Project) => void
  onDelete: (id: string) => void
  onUpsertGroup: (group: Group) => void
  onDeleteGroup: (id: string) => void
}

export function Dashboard({
  projects,
  groups,
  userEmail,
  onLogout,
  onOpen,
  onCreate,
  onDelete,
  onUpsertGroup,
  onDeleteGroup,
}: DashboardProps) {
  const [creating, setCreating] = useState(false)
  const [title, setTitle] = useState('')
  const [artist, setArtist] = useState('')

  const create = () => {
    if (!title.trim()) return
    const project: Project = {
      id: uid(),
      title: title.trim(),
      artist: artist.trim(),
      members: [],
      segments: [],
      hasAudio: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    onCreate(project)
    setTitle('')
    setArtist('')
    setCreating(false)
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-4xl flex-col gap-8 px-6 py-12">
      <header className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <h1>
            <Logo showWordmark className="size-11" wordmarkClassName="text-2xl" />
            <span className="sr-only">KDISTRIBUTION</span>
          </h1>
          {onLogout && (
            <div className="ml-auto flex items-center gap-2">
              {userEmail && (
                <span className="hidden text-xs text-muted-foreground sm:inline">{userEmail}</span>
              )}
              <Button size="sm" variant="ghost" onClick={onLogout}>
                <LogOut className="size-4" />
                Sair
              </Button>
            </div>
          )}
        </div>
        <p className="text-sm text-muted-foreground text-pretty">
          Crie e exporte vídeos de K-pop Line Distribution direto do navegador.
        </p>
      </header>

      {creating ? (
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5">
          <h2 className="text-sm font-semibold">Novo projeto</h2>
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.nativeEvent.isComposing && e.keyCode !== 229) create()
            }}
            placeholder="Título da música"
            className="h-10 rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Título da música"
          />
          <input
            value={artist}
            onChange={(e) => setArtist(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.nativeEvent.isComposing && e.keyCode !== 229) create()
            }}
            placeholder="Artista / Grupo"
            className="h-10 rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Artista ou grupo"
          />
          <div className="flex gap-2">
            <Button onClick={create} disabled={!title.trim()}>
              Criar projeto
            </Button>
            <Button variant="ghost" onClick={() => setCreating(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      ) : (
        <Button className="w-fit" onClick={() => setCreating(true)}>
          <Plus className="size-4" />
          Novo projeto
        </Button>
      )}

      {projects.length === 0 && !creating && (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border p-12 text-center">
          <p className="font-medium">Nenhum projeto ainda</p>
          <p className="text-sm text-muted-foreground text-pretty">
            Crie seu primeiro projeto de line distribution para começar.
          </p>
        </div>
      )}

      <GroupsSection groups={groups} onUpsert={onUpsertGroup} onDelete={onDeleteGroup} />

      <ul className="grid gap-4 sm:grid-cols-2">
        {projects.map((p) => (
          <li key={p.id}>
            <div className="group flex items-center gap-4 rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/50">
              <button
                type="button"
                onClick={() => onOpen(p)}
                className="flex min-w-0 flex-1 items-center gap-4 text-left"
              >
                {p.coverImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.coverImage}
                    alt=""
                    className="size-14 shrink-0 rounded-lg object-cover"
                  />
                ) : (
                  <span className="flex size-14 shrink-0 items-center justify-center rounded-lg bg-secondary">
                    <Mic2 className="size-5 text-muted-foreground" />
                  </span>
                )}
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{p.title}</span>
                  <span className="block truncate text-sm text-muted-foreground">
                    {p.artist || 'Sem artista'} · {p.members.length} membros ·{' '}
                    {p.segments.length} segmentos
                  </span>
                </span>
              </button>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => onDelete(p.id)}
                aria-label={`Excluir ${p.title}`}
              >
                <Trash2 className="size-4 text-destructive" />
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </main>
  )
}
