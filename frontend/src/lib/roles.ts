import api, {
  DEFAULT_PAGE_SIZE,
  type PaginationMeta,
  readResponsePagination,
} from "./api"

export interface Role {
  id: string
  name: string
  hierarchy_level: number
  is_system: boolean
  company_id: string | null
  permission_codes: string[]
}

export interface StoreRoleRequest {
  name: string
  hierarchy_level: number
  permission_ids: string[]
}

export interface UpdateRoleRequest {
  name?: string
  hierarchy_level?: number
  permission_ids?: string[] | null
}

export interface PaginatedResponse<T> {
  data: T[]
  current_page: number
  last_page: number
  per_page: number
  total: number
  from: number | null
  to: number | null
}

function mapPagination(
  p: PaginationMeta | null | undefined,
  page: number,
  perPage: number,
  itemsLen: number,
): Pick<
  PaginatedResponse<Role>,
  "current_page" | "last_page" | "per_page" | "total" | "from" | "to"
> {
  const current = p?.page ?? page
  const per = p?.page_size ?? perPage
  const total = p?.total ?? itemsLen
  const last = p?.total_pages ?? 1
  return {
    current_page: current,
    last_page: last,
    per_page: per,
    total,
    from: total ? (current - 1) * per + 1 : null,
    to: total ? Math.min(current * per, total) : null,
  }
}

export async function getRoles(
  page: number = 1,
  perPage: number = DEFAULT_PAGE_SIZE,
): Promise<PaginatedResponse<Role>> {
  const response = await api.get<{ items: Role[] }>("/roles", {
    params: { page, page_size: perPage },
  })
  const items = response.data?.items ?? []
  const meta = mapPagination(
    readResponsePagination(response),
    page,
    perPage,
    items.length,
  )
  return { data: items, ...meta }
}

/** Fetches every role by paging with `DEFAULT_PAGE_SIZE` (for user role dropdown, etc.). */
export async function getAllRoles(): Promise<Role[]> {
  const out: Role[] = []
  let page = 1
  while (true) {
    const r = await getRoles(page, DEFAULT_PAGE_SIZE)
    out.push(...r.data)
    if (r.data.length === 0 || page >= r.last_page) break
    page += 1
  }
  return out
}

export async function getRole(id: string): Promise<Role> {
  const response = await api.get<Role>(`/roles/${id}`)
  return response.data
}

export async function createRole(
  data: StoreRoleRequest,
): Promise<{ message: string; data: Role }> {
  const response = await api.post<Role>("/roles", data)
  return { message: "Role created", data: response.data }
}

export async function updateRole(
  id: string,
  data: UpdateRoleRequest,
): Promise<{ message: string; data: Role }> {
  const response = await api.put<Role>(`/roles/${id}`, data)
  return { message: "Role updated", data: response.data }
}

export async function deleteRole(id: string): Promise<{ message: string }> {
  await api.delete(`/roles/${id}`)
  return { message: "Role deleted" }
}
