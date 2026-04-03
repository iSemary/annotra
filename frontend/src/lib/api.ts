import axios, { type AxiosResponse, type InternalAxiosRequestConfig } from "axios"

/** Default page size for dashboard tables and list APIs. */
export const DEFAULT_PAGE_SIZE = 5

export interface PaginationMeta {
  page: number
  page_size: number
  total: number
  total_pages: number
}

export interface ApiSuccessEnvelope<T = unknown> {
  statusCode: number
  message: string
  data: T
  pagination?: PaginationMeta | null
}

function isSuccessEnvelope(body: unknown): body is ApiSuccessEnvelope {
  return (
    !!body &&
    typeof body === "object" &&
    body !== null &&
    "statusCode" in body &&
    "message" in body &&
    "data" in body
  )
}

/** After the interceptor, `response.data` is the API envelope's inner `data` field. */
const api = axios.create({
  baseURL:
    process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8006/api/v1",
  withCredentials: true,
})

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  if (typeof window !== "undefined") {
    const token = window.localStorage.getItem("auth_token")
    if (token) {
      config.headers.set("Authorization", `Bearer ${token}`)
    }
  }
  return config
})

api.interceptors.response.use(
  (response: AxiosResponse) => {
    const body = response.data
    if (isSuccessEnvelope(body)) {
      const r = response as AxiosResponse<unknown> & {
        pagination?: PaginationMeta | null
      }
      r.pagination = body.pagination ?? null
      r.data = body.data
    }
    return response
  },
  (error) => {
    if (
      error.response?.status === 401 &&
      typeof window !== "undefined"
    ) {
      const url = (error.config?.url ?? "") as string
      const skip =
        url.includes("/auth/login") ||
        url.includes("/auth/register") ||
        url.includes("/auth/logout") ||
        url.includes("/auth/2fa/verify")
      if (!skip) {
        window.localStorage.removeItem("auth_token")
        window.localStorage.removeItem("auth_user")
        if (!window.location.pathname.startsWith("/login")) {
          window.location.href = "/login"
        }
      }
    }
    return Promise.reject(error)
  },
)

export function readResponsePagination<T>(
  response: AxiosResponse<T>,
): PaginationMeta | null {
  const r = response as AxiosResponse<T> & {
    pagination?: PaginationMeta | null
  }
  return r.pagination ?? null
}

/** Mirrors backend UserPublic plus client-only fields from GET /auth/me */
export interface AuthUser {
  id: string
  full_name: string
  /** Alias for display when mapping legacy shapes */
  name?: string
  email: string
  phone: string
  company_id: string
  role: string
  role_id: string
  slug: string
  is_superuser: boolean
  two_factor_enabled?: boolean
  /** From server env TWO_FACTOR_ENABLED; when false, UI hides 2FA flows */
  two_factor_feature_enabled?: boolean
  permissions?: string[]
}

export interface PublicAuthConfig {
  two_factor_feature_enabled: boolean
}

export async function fetchPublicAuthConfig(): Promise<PublicAuthConfig> {
  const r = await api.get<PublicAuthConfig>("/auth/public-config")
  return r.data as PublicAuthConfig
}

export interface AuthTokensPayload {
  access_token: string
  token_type?: string
  user: AuthUser
}

export interface TwoFactorRequiredResponse {
  requires_2fa: true
  temp_token: string
  message: string
}

export interface TwoFactorSetupResponse {
  secret: string
  qr_code_url: string
}

export interface TwoFactorConfirmResponse {
  message: string
  recovery_codes: string[]
}

export interface TwoFactorVerifyResponse {
  access_token: string
  token_type?: string
  user: AuthUser
}

export default api
