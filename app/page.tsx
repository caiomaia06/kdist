'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Dashboard } from '@/components/dashboard'
import { Editor } from '@/components/editor'
import {
  deleteGroupCloud,
  deleteProjectCloud,
  fetchGroups,
  fetchProjects,
  hasLocalData,
  migrateLocalData,
  upsertGroupCloud,
  upsertProjectCloud,
} from '@/lib/cloud-storage'
import { createClient } from '@/lib/supabase/client'
import type { Group, Project } from '@/lib/types'

export default function Home() {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [projects, setProjects] = useState<Project[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [openProject, setOpenProject] = useState<Project | null>(null)
  const [loading, setLoading] = useState(true)
  const [migrating, setMigrating] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    let cancelled = false

    const init = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        router.replace('/auth/login')
        return
      }
      if (cancelled) return
      setUserId(user.id)
      setUserEmail(user.email ?? null)

      // Migração única dos dados locais para a nuvem
      if (hasLocalData()) {
        setMigrating(true)
        try {
          await migrateLocalData(user.id)
        } catch (e) {
          console.error('Falha na migração dos dados locais', e)
        }
        setMigrating(false)
      }

      try {
        const [p, g] = await Promise.all([fetchProjects(), fetchGroups()])
        if (!cancelled) {
          setProjects(p)
          setGroups(g)
        }
      } catch (e) {
        console.error('Falha ao carregar dados da nuvem', e)
      }
      if (!cancelled) setLoading(false)
    }

    void init()
    return () => {
      cancelled = true
    }
  }, [router])

  const logout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.replace('/auth/login')
  }

  if (loading || !userId) {
    return (
      <main className="flex min-h-dvh items-center justify-center">
        <p className="text-sm text-muted-foreground" role="status">
          {migrating ? 'Migrando seus dados locais para a nuvem…' : 'Carregando…'}
        </p>
      </main>
    )
  }

  if (openProject) {
    return (
      <Editor
        key={openProject.id}
        initialProject={openProject}
        groups={groups}
        userId={userId}
        onBack={async () => {
          setOpenProject(null)
          try {
            setProjects(await fetchProjects())
          } catch (e) {
            console.error('Falha ao recarregar projetos', e)
          }
        }}
      />
    )
  }

  return (
    <Dashboard
      projects={projects}
      groups={groups}
      userEmail={userEmail}
      onLogout={logout}
      onOpen={(p) => setOpenProject(p)}
      onCreate={(p) => {
        setProjects((prev) => [p, ...prev])
        setOpenProject(p)
        void upsertProjectCloud(p, userId).catch((e) =>
          console.error('Falha ao criar projeto na nuvem', e),
        )
      }}
      onDelete={(id) => {
        const project = projects.find((p) => p.id === id)
        setProjects((prev) => prev.filter((p) => p.id !== id))
        if (project) {
          void deleteProjectCloud(project, userId).catch((e) =>
            console.error('Falha ao excluir projeto na nuvem', e),
          )
        }
      }}
      onUpsertGroup={(g) => {
        setGroups((prev) => {
          const idx = prev.findIndex((x) => x.id === g.id)
          if (idx >= 0) {
            const next = [...prev]
            next[idx] = g
            return next
          }
          return [g, ...prev]
        })
        void upsertGroupCloud(g, userId).catch((e) =>
          console.error('Falha ao salvar grupo na nuvem', e),
        )
      }}
      onDeleteGroup={(id) => {
        setGroups((prev) => prev.filter((g) => g.id !== id))
        void deleteGroupCloud(id).catch((e) =>
          console.error('Falha ao excluir grupo na nuvem', e),
        )
      }}
    />
  )
}
