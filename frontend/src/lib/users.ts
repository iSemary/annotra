import api, {
  DEFAULT_PAGE_SIZE,
  type PaginationMeta,
  readResponsePagination,
} from "./api"

export interface User {
  id: string
  full_name: string
  email: string
  phone: string
  role_id: string
  role_name: string
  created_at: string
  updated_at: string
}

export interface StoreUserRequest {
  full_name: string
  email: string
  phone: string
  password: string
  role_id: string
}

export interface UpdateUserRequest {
  full_name?: string
  email?: string
  phone?: string
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
  PaginatedResponse<User>,
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

export async function getUsers(
  page: number = 1,
  perPage: number = DEFAULT_PAGE_SIZE,
  q?: string,
): Promise<PaginatedResponse<User>> {
  const response = await api.get<{ items: User[] }>("/users", {
    params: { page, page_size: perPage, q: q || undefined },
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

export async function getUser(id: string): Promise<User> {
  const response = await api.get<User>(`/users/${id}`)
  return response.data
}

export async function createUser(
  data: StoreUserRequest,
): Promise<{ message: string; data: Partial<User> }> {
  const response = await api.post<Partial<User> & { id?: string }>(
    "/users",
    data,
  )
  return { message: "User created", data: response.data }
}

export async function updateUser(
  id: string,
  data: UpdateUserRequest,
): Promise<{ message: string; data: Partial<User> }> {
  const response = await api.patch<Partial<User>>(`/users/${id}`, data)
  return { message: "User updated", data: response.data }
}

export async function patchUserRole(
  id: string,
  roleId: string,
): Promise<{ message: string; data: Partial<User> }> {
  const response = await api.patch<Partial<User>>(`/users/${id}/role`, {
    role_id: roleId,
  })
  return { message: "Role updated", data: response.data }
}

export async function deleteUser(id: string): Promise<{ message: string }> {
  await api.delete(`/users/${id}`)
  return { message: "User deleted" }
}
