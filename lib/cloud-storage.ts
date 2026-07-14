import { createClient } from '@/lib/supabase/client'
import {
  loadAudio as loadLocalAudio,
  loadGroups as loadLocalGroups,
  loadProjects as loadLocalProjects,
} from '@/lib/storage'
import { uid, type Group, type Member, type Project, type Segment } from '@/lib/types'

const AUDIO_BUCKET = 'audio'

// ---------- Mapeamento linha <-> tipos do app ----------

interface ProjectRow {
  id: string
  title: string
  artist: string
  cover_url: string | null
  audio_path: string | null
  audio_name: string | null
  members: Member[]
  segments: Segment[]
  duration: number | null
  created_at: string
  updated_at: string
}

interface GroupRow {
  id: string
  name: string
  members: Member[]
  created_at: string
  updated_at: string
}

function rowToProject(row: ProjectRow): Project {
  return {
    id: row.id,
    title: row.title,
    artist: row.artist,
    coverImage: row.cover_url ?? undefined,
    members: row.members ?? [],
    segments: row.segments ?? [],
    hasAudio: !!row.audio_path,
    audioName: row.audio_name ?? undefined,
    duration: row.duration ?? undefined,
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime(),
  }
}

function rowToGroup(row: GroupRow): Group {
  return {
    id: row.id,
    name: row.name,
    members: row.members ?? [],
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime(),
  }
}

// ---------- Projetos ----------

export async function fetchProjects(): Promise<Project[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .order('updated_at', { ascending: false })
  if (error) throw error
  return (data as ProjectRow[]).map(rowToProject)
}

export async function upsertProjectCloud(project: Project, userId: string): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase.from('projects').upsert({
    id: project.id,
    user_id: userId,
    title: project.title,
    artist: project.artist,
    cover_url: project.coverImage ?? null,
    audio_name: project.audioName ?? null,
    members: project.members,
    segments: project.segments,
    duration: project.duration ?? null,
    updated_at: new Date().toISOString(),
  })
  if (error) throw error
}

export async function deleteProjectCloud(project: Project, userId: string): Promise<void> {
  const supabase = createClient()
  // Remove o áudio do Storage primeiro (se houver)
  if (project.hasAudio) {
    await supabase.storage.from(AUDIO_BUCKET).remove([audioPath(userId, project.id)])
  }
  const { error } = await supabase.from('projects').delete().eq('id', project.id)
  if (error) throw error
}

// ---------- Grupos ----------

export async function fetchGroups(): Promise<Group[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('groups')
    .select('*')
    .order('updated_at', { ascending: false })
  if (error) throw error
  return (data as GroupRow[]).map(rowToGroup)
}

export async function upsertGroupCloud(group: Group, userId: string): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase.from('groups').upsert({
    id: group.id,
    user_id: userId,
    name: group.name,
    members: group.members,
    updated_at: new Date().toISOString(),
  })
  if (error) throw error
}

export async function deleteGroupCloud(id: string): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase.from('groups').delete().eq('id', id)
  if (error) throw error
}

// ---------- Áudio no Storage ----------

function audioPath(userId: string, projectId: string): string {
  return `${userId}/${projectId}`
}

export async function uploadAudioCloud(
  userId: string,
  projectId: string,
  file: Blob,
): Promise<string> {
  const supabase = createClient()
  const path = audioPath(userId, projectId)
  const { error } = await supabase.storage.from(AUDIO_BUCKET).upload(path, file, {
    upsert: true,
    contentType: file.type || 'audio/mpeg',
  })
  if (error) throw error
  // Registra o caminho no projeto
  const { error: dbError } = await supabase
    .from('projects')
    .update({ audio_path: path })
    .eq('id', projectId)
  if (dbError) throw dbError
  return path
}

export async function getAudioUrlCloud(
  userId: string,
  projectId: string,
): Promise<string | null> {
  const supabase = createClient()
  const { data, error } = await supabase.storage
    .from(AUDIO_BUCKET)
    .createSignedUrl(audioPath(userId, projectId), 60 * 60 * 6) // 6h
  if (error) return null
  return data.signedUrl
}

// ---------- Migração dos dados locais (localStorage + IndexedDB) ----------

const MIGRATED_KEY = 'kdistribution-migrated'

export function hasLocalData(): boolean {
  if (typeof window === 'undefined') return false
  if (localStorage.getItem(MIGRATED_KEY)) return false
  return loadLocalProjects().length > 0 || loadLocalGroups().length > 0
}

export async function migrateLocalData(userId: string): Promise<{
  projects: number
  groups: number
}> {
  const localProjects = loadLocalProjects()
  const localGroups = loadLocalGroups()
  let projectCount = 0
  let groupCount = 0

  for (const p of localProjects) {
    // Ids locais antigos não são UUID — gera um novo para o banco
    const newId = uid()
    const migrated: Project = { ...p, id: newId }
    try {
      await upsertProjectCloud(migrated, userId)
      if (p.hasAudio) {
        const blob = await loadLocalAudio(p.id)
        if (blob) await uploadAudioCloud(userId, newId, blob)
      }
      projectCount++
    } catch (e) {
      console.error('Falha ao migrar projeto', p.title, e)
    }
  }

  for (const g of localGroups) {
    try {
      await upsertGroupCloud({ ...g, id: uid() }, userId)
      groupCount++
    } catch (e) {
      console.error('Falha ao migrar grupo', g.name, e)
    }
  }

  // Marca como migrado para não repetir (mantém os dados locais como backup)
  localStorage.setItem(MIGRATED_KEY, String(Date.now()))
  return { projects: projectCount, groups: groupCount }
}
