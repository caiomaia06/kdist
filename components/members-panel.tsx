'use client'

import { useRef, useState } from 'react'
import { Plus, Trash2, Upload, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { compressImage } from '@/lib/image-utils'
import { MEMBER_COLORS, uid, type Group, type Member } from '@/lib/types'

interface MembersPanelProps {
  members: Member[]
  groups?: Group[]
  onChange: (members: Member[]) => void
}

export function MembersPanel({ members, groups = [], onChange }: MembersPanelProps) {
  const [name, setName] = useState('')
  const [color, setColor] = useState(MEMBER_COLORS[0])
  const [groupId, setGroupId] = useState('')
  const fileRefs = useRef<Map<string, HTMLInputElement>>(new Map())

  const importGroup = () => {
    const group = groups.find((g) => g.id === groupId)
    if (!group) return
    // Novos ids para não colidir se importar o mesmo grupo mais de uma vez
    const imported: Member[] = group.members.map((m) => ({ ...m, id: uid() }))
    onChange([...members, ...imported])
    setGroupId('')
  }

  const addMember = () => {
    const trimmed = name.trim()
    if (!trimmed) return
    const next: Member = { id: uid(), name: trimmed, color }
    onChange([...members, next])
    setName('')
    setColor(MEMBER_COLORS[(members.length + 1) % MEMBER_COLORS.length])
  }

  const updateMember = (id: string, patch: Partial<Member>) => {
    onChange(members.map((m) => (m.id === id ? { ...m, ...patch } : m)))
  }

  const removeMember = (id: string) => {
    onChange(members.filter((m) => m.id !== id))
  }

  const handleAvatar = async (id: string, file: File | undefined) => {
    if (!file) return
    try {
      const avatar = await compressImage(file) // 150x150 jpeg 0.6
      updateMember(id, { avatar })
    } catch (e) {
      console.error('Falha ao comprimir avatar', e)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {groups.length > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-card p-2">
          <Users className="size-4 shrink-0 text-primary" aria-hidden="true" />
          <select
            value={groupId}
            onChange={(e) => setGroupId(e.target.value)}
            className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Grupo pronto"
          >
            <option value="">Usar grupo pronto…</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name} ({g.members.length} membros)
              </option>
            ))}
          </select>
          <Button size="sm" variant="secondary" onClick={importGroup} disabled={!groupId}>
            Importar
          </Button>
        </div>
      )}

      <div className="flex items-center gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing && e.keyCode !== 229) addMember()
          }}
          placeholder="Nome do membro"
          className="h-9 min-w-0 flex-1 rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Nome do membro"
        />
        <input
          type="color"
          value={color}
          onChange={(e) => setColor(e.target.value)}
          className="h-9 w-10 cursor-pointer rounded-md border border-input bg-transparent p-1"
          aria-label="Cor do membro"
        />
        <Button size="sm" onClick={addMember} disabled={!name.trim()}>
          <Plus className="size-4" />
          Adicionar
        </Button>
      </div>

      {members.length === 0 && (
        <p className="rounded-md border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
          Nenhum membro ainda. Adicione os integrantes do grupo acima.
        </p>
      )}

      <ul className="flex flex-col gap-2">
        {members.map((m) => (
          <li
            key={m.id}
            className="flex items-center gap-3 rounded-lg border border-border bg-card p-2"
          >
            <button
              type="button"
              onClick={() => fileRefs.current.get(m.id)?.click()}
              className="relative size-10 shrink-0 overflow-hidden rounded-full border-2"
              style={{ borderColor: m.color }}
              aria-label={`Trocar foto de ${m.name}`}
            >
              {m.avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={m.avatar} alt="" className="size-full object-cover" />
              ) : (
                <span className="flex size-full items-center justify-center bg-secondary text-xs font-bold">
                  {m.name[0]?.toUpperCase()}
                </span>
              )}
              <span className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition-opacity hover:opacity-100">
                <Upload className="size-4 text-white" />
              </span>
            </button>
            <input
              ref={(el) => {
                if (el) fileRefs.current.set(m.id, el)
              }}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => void handleAvatar(m.id, e.target.files?.[0])}
            />
            <input
              value={m.name}
              onChange={(e) => updateMember(m.id, { name: e.target.value })}
              className="h-8 min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-2 text-sm outline-none focus-visible:border-input"
              aria-label={`Nome de ${m.name}`}
            />
            <input
              type="color"
              value={m.color}
              onChange={(e) => updateMember(m.id, { color: e.target.value })}
              className="h-8 w-9 cursor-pointer rounded-md border border-input bg-transparent p-0.5"
              aria-label={`Cor de ${m.name}`}
            />
            <Button
              size="icon"
              variant="ghost"
              onClick={() => removeMember(m.id)}
              aria-label={`Remover ${m.name}`}
            >
              <Trash2 className="size-4 text-destructive" />
            </Button>
          </li>
        ))}
      </ul>
    </div>
  )
}
