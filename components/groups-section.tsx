'use client'

import { useState } from 'react'
import { Pencil, Plus, Trash2, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { MembersPanel } from '@/components/members-panel'
import { uid, type Group, type Member } from '@/lib/types'

interface GroupsSectionProps {
  groups: Group[]
  onUpsert: (group: Group) => void
  onDelete: (id: string) => void
}

export function GroupsSection({ groups, onUpsert, onDelete }: GroupsSectionProps) {
  // null = fechado | 'new' = criando | Group = editando
  const [editing, setEditing] = useState<Group | 'new' | null>(null)
  const [name, setName] = useState('')
  const [members, setMembers] = useState<Member[]>([])

  const openNew = () => {
    setName('')
    setMembers([])
    setEditing('new')
  }

  const openEdit = (g: Group) => {
    setName(g.name)
    setMembers(g.members)
    setEditing(g)
  }

  const save = () => {
    const trimmed = name.trim()
    if (!trimmed || members.length === 0) return
    const now = Date.now()
    const group: Group =
      editing !== 'new' && editing
        ? { ...editing, name: trimmed, members, updatedAt: now }
        : { id: uid(), name: trimmed, members, createdAt: now, updatedAt: now }
    onUpsert(group)
    setEditing(null)
  }

  return (
    <section className="flex flex-col gap-4" aria-labelledby="groups-heading">
      <div className="flex items-center justify-between gap-3">
        <h2 id="groups-heading" className="flex items-center gap-2 text-sm font-semibold">
          <Users className="size-4 text-primary" />
          Meus grupos
        </h2>
        {editing === null && (
          <Button size="sm" variant="secondary" onClick={openNew}>
            <Plus className="size-4" />
            Novo grupo
          </Button>
        )}
      </div>

      {editing !== null && (
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold">
            {editing === 'new' ? 'Novo grupo' : `Editando ${editing.name}`}
          </h3>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nome do grupo (ex: BTS, TWICE...)"
            className="h-10 rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Nome do grupo"
          />
          <MembersPanel members={members} onChange={setMembers} />
          <div className="flex gap-2">
            <Button onClick={save} disabled={!name.trim() || members.length === 0}>
              Salvar grupo
            </Button>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {groups.length === 0 && editing === null && (
        <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground text-pretty">
          Salve seus grupos favoritos com membros e cores para reutilizá-los em qualquer projeto.
        </p>
      )}

      {groups.length > 0 && (
        <ul className="grid gap-3 sm:grid-cols-2">
          {groups.map((g) => (
            <li
              key={g.id}
              className="flex items-center gap-3 rounded-xl border border-border bg-card p-4"
            >
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <span className="truncate font-semibold">{g.name}</span>
                <div className="flex items-center gap-1">
                  {g.members.slice(0, 8).map((m) =>
                    m.avatar ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={m.id}
                        src={m.avatar}
                        alt={m.name}
                        title={m.name}
                        className="size-6 rounded-full border-2 object-cover"
                        style={{ borderColor: m.color }}
                      />
                    ) : (
                      <span
                        key={m.id}
                        title={m.name}
                        className="flex size-6 items-center justify-center rounded-full text-[10px] font-bold text-background"
                        style={{ backgroundColor: m.color }}
                      >
                        {m.name[0]?.toUpperCase()}
                      </span>
                    ),
                  )}
                  {g.members.length > 8 && (
                    <span className="text-xs text-muted-foreground">+{g.members.length - 8}</span>
                  )}
                </div>
                <span className="text-xs text-muted-foreground">
                  {g.members.length} {g.members.length === 1 ? 'membro' : 'membros'}
                </span>
              </div>
              <div className="flex shrink-0 flex-col gap-1">
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => openEdit(g)}
                  aria-label={`Editar ${g.name}`}
                >
                  <Pencil className="size-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => onDelete(g.id)}
                  aria-label={`Excluir ${g.name}`}
                >
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
