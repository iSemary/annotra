import api, { DEFAULT_PAGE_SIZE, readResponsePagination } from "./api"

export type ProjectStatus = "active" | "archived"

export interface Project {
  id: string
  name: string
  description: string | null
  status: ProjectStatus
  created_at: string
  updated_at: string
}

export interface StoreProjectRequest {
  name: string
  description?: string | null
  status?: ProjectStatus
}

export interface UpdateProjectRequest {
  name?: string
  description?: string | null
  status?: ProjectStatus
}

export interface PaginatedProjectsResponse {
  data: Project[]
  current_page: number
  last_page: number
  per_page: number
  total: number
}

function projectListFromInner(inner: unknown): Project[] {
  if (Array.isArray(inner)) return inner as Project[]
  if (inner && typeof inner === "object") {
    const o = inner as { data?: Project[]; items?: Project[] }
    if (Array.isArray(o.data)) return o.data
    if (Array.isArray(o.items)) return o.items
  }
  return []
}

export async function getProjects(params?: {
  page?: number
  per_page?: number
  status?: string
  search?: string
}): Promise<PaginatedProjectsResponse> {
  const response = await api.get<unknown>("/projects", { params })
  const list = projectListFromInner(response.data)
  const p = readResponsePagination(response)
  return {
    data: list,
    current_page: p?.page ?? params?.page ?? 1,
    last_page: p?.total_pages ?? 1,
    per_page: p?.page_size ?? params?.per_page ?? DEFAULT_PAGE_SIZE,
    total: p?.total ?? list.length,
  }
}

export async function getProject(id: string): Promise<Project> {
  const response = await api.get<unknown>(`/projects/${id}`)
  const inner = response.data as Project | { data: Project }
  if (inner && typeof inner === "object" && "data" in inner && inner.data)
    return inner.data
  return inner as Project
}

export async function createProject(body: StoreProjectRequest): Promise<Project> {
  const response = await api.post<unknown>("/projects", body)
  const inner = response.data as Project | { data: Project }
  if (inner && typeof inner === "object" && "data" in inner && inner.data)
    return inner.data
  return inner as Project
}

export async function updateProject(
  id: string,
  body: UpdateProjectRequest,
): Promise<Project> {
  const response = await api.put<unknown>(`/projects/${id}`, body)
  const inner = response.data as Project | { data: Project }
  if (inner && typeof inner === "object" && "data" in inner && inner.data)
    return inner.data
  return inner as Project
}

export async function deleteProject(id: string) {
  await api.delete(`/projects/${id}`)
}
