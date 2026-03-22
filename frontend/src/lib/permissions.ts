import api, {
  DEFAULT_PAGE_SIZE,
  type PaginationMeta,
  readResponsePagination,
} from "./api"

export interface Permission {
  id: string
  code: string
  description: string | null
}

export interface StorePermissionRequest {
  code: string
  description?: string | null
}

export interface UpdatePermissionRequest {
  description?: string | null
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
  PaginatedResponse<Permission>,
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

export async function getPermissions(
  page: number = 1,
  perPage: number = DEFAULT_PAGE_SIZE,
  codePrefix?: string,
): Promise<PaginatedResponse<Permission>> {
  const response = await api.get<{ items: Permission[] }>("/permissions", {
    params: {
      page,
      page_size: perPage,
      code_prefix: codePrefix || undefined,
    },
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

/** Fetches every permission by paging with `DEFAULT_PAGE_SIZE` (for role editor, etc.). */
export async function getAllPermissions(
  codePrefix?: string,
): Promise<Permission[]> {
  const out: Permission[] = []
  let page = 1
  while (true) {
    const r = await getPermissions(page, DEFAULT_PAGE_SIZE, codePrefix)
    out.push(...r.data)
    if (r.data.length === 0 || page >= r.last_page) break
    page += 1
  }
  return out
}

export async function getPermission(id: string): Promise<Permission> {
  const response = await api.get<Permission>(`/permissions/${id}`)
  return response.data
}

export async function createPermission(
  data: StorePermissionRequest,
): Promise<{ message: string; data: Permission }> {
  const response = await api.post<Permission>("/permissions", data)
  return { message: "Permission created", data: response.data }
}

export async function updatePermission(
  id: string,
  data: UpdatePermissionRequest,
): Promise<{ message: string; data: Permission }> {
  const response = await api.patch<Permission>(`/permissions/${id}`, data)
  return { message: "Permission updated", data: response.data }
}

export async function deletePermission(id: string): Promise<{ message: string }> {
  await api.delete(`/permissions/${id}`)
  return { message: "Permission deleted" }
}
