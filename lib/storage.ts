import type { Group, Project } from './types'

const LS_KEY = 'kdistribution-projects'
const LS_GROUPS_KEY = 'kdistribution-groups'

// ---------- localStorage: metadados dos projetos ----------

export function loadProjects(): Project[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveProjects(projects: Project[]): boolean {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(projects))
    return true
  } catch (e) {
    console.error('Falha ao salvar no localStorage (limite excedido?)', e)
    return false
  }
}

export function upsertProject(project: Project): Project[] {
  const projects = loadProjects()
  const idx = projects.findIndex((p) => p.id === project.id)
  if (idx >= 0) projects[idx] = project
  else projects.unshift(project)
  saveProjects(projects)
  return projects
}

export function removeProject(id: string): Project[] {
  const projects = loadProjects().filter((p) => p.id !== id)
  saveProjects(projects)
  void deleteAudio(id)
  return projects
}

// ---------- localStorage: grupos salvos (reutilizáveis entre projetos) ----------

export function loadGroups(): Group[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(LS_GROUPS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveGroups(groups: Group[]): boolean {
  try {
    localStorage.setItem(LS_GROUPS_KEY, JSON.stringify(groups))
    return true
  } catch (e) {
    console.error('Falha ao salvar grupos no localStorage (limite excedido?)', e)
    return false
  }
}

export function upsertGroup(group: Group): Group[] {
  const groups = loadGroups()
  const idx = groups.findIndex((g) => g.id === group.id)
  if (idx >= 0) groups[idx] = group
  else groups.unshift(group)
  saveGroups(groups)
  return groups
}

export function removeGroup(id: string): Group[] {
  const groups = loadGroups().filter((g) => g.id !== id)
  saveGroups(groups)
  return groups
}

// ---------- IndexedDB: arquivos de áudio (grandes demais p/ localStorage) ----------

const DB_NAME = 'kdistribution-audio'
const STORE = 'audio'

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE)
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function saveAudio(projectId: string, blob: Blob): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(blob, projectId)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function loadAudio(projectId: string): Promise<Blob | null> {
  try {
    const db = await openDB()
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly')
      const req = tx.objectStore(STORE).get(projectId)
      req.onsuccess = () => resolve((req.result as Blob) ?? null)
      req.onerror = () => reject(req.error)
    })
  } catch {
    return null
  }
}

export async function deleteAudio(projectId: string): Promise<void> {
  try {
    const db = await openDB()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).delete(projectId)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch {
    // ignora
  }
  // Remove também o vídeo complementar associado ao projeto
  void deleteVideoFile(projectId)
}

// ---------- IndexedDB: vídeo complementar (PiP / background) ----------
// Mesmo object store do áudio, com sufixo na chave — sem bump de versão do DB.

function videoKey(projectId: string): string {
  return `${projectId}::video`
}

export async function saveVideoFile(projectId: string, blob: Blob): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(blob, videoKey(projectId))
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function loadVideoFile(projectId: string): Promise<Blob | null> {
  try {
    const db = await openDB()
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly')
      const req = tx.objectStore(STORE).get(videoKey(projectId))
      req.onsuccess = () => resolve((req.result as Blob) ?? null)
      req.onerror = () => reject(req.error)
    })
  } catch {
    return null
  }
}

export async function deleteVideoFile(projectId: string): Promise<void> {
  try {
    const db = await openDB()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).delete(videoKey(projectId))
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch {
    // ignora
  }
}
