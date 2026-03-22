'use client'

import { createContext, useContext, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import api, {
  type AuthUser,
  type AuthTokensPayload,
  type TwoFactorRequiredResponse,
} from "@/lib/api"
import { twoFactor } from "@/lib/two-factor"
import { toast } from "sonner"

export interface RegisterPayload {
  full_name: string
  company_name: string
  email: string
  phone: string
  password: string
  confirm_password: string
}

function normalizeUser(raw: Record<string, unknown>): AuthUser {
  const fullName = String(raw.full_name ?? raw.name ?? "")
  const perms = raw.permissions
  return {
    id: String(raw.id ?? ""),
    full_name: fullName,
    name: fullName,
    email: String(raw.email ?? ""),
    phone: String(raw.phone ?? ""),
    company_id: String(raw.company_id ?? ""),
    role: String(raw.role ?? ""),
    role_id: String(raw.role_id ?? ""),
    slug: String(raw.slug ?? ""),
    is_superuser: Boolean(raw.is_superuser),
    two_factor_enabled: Boolean(raw.two_factor_enabled),
    two_factor_feature_enabled: raw.two_factor_feature_enabled !== false,
    permissions: Array.isArray(perms)
      ? (perms as string[])
      : [],
  }
}

function handleAuthPayload(payload: AuthTokensPayload) {
  const token = payload.access_token
  const user = normalizeUser(
    payload.user as unknown as Record<string, unknown>,
  )
  if (typeof window !== "undefined") {
    window.localStorage.setItem("auth_token", token)
    window.localStorage.setItem("auth_user", JSON.stringify(user))
  }
  return { token, user }
}

interface AuthContextValue {
  user: AuthUser | null
  token: string | null
  isAuthenticated: boolean
  loading: boolean
  login: (data: {
    email: string
    password: string
    remember_me?: boolean
  }) => Promise<void>
  register: (data: RegisterPayload) => Promise<void>
  logout: () => Promise<void>
  verifyTwoFactor: (tempToken: string, code: string) => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    if (typeof window === "undefined") return

    const storedToken = window.localStorage.getItem("auth_token")
    const storedUser = window.localStorage.getItem("auth_user")

    if (storedToken && storedUser) {
      setToken(storedToken)
      try {
        const parsed = JSON.parse(storedUser) as Record<string, unknown>
        setUser(normalizeUser(parsed))
      } catch {
        setUser(null)
      }
      api
        .get<Record<string, unknown>>("/auth/me")
        .then((response) => {
          const u = normalizeUser(response.data)
          setUser(u)
          window.localStorage.setItem("auth_user", JSON.stringify(u))
        })
        .catch(() => {})
        .finally(() => setLoading(false))
      return
    }

    setLoading(false)
  }, [])

  const login: AuthContextValue["login"] = async (payload) => {
    try {
      setLoading(true)
      const { remember_me, ...loginPayload } = payload

      const response = await api.post<
        AuthTokensPayload | TwoFactorRequiredResponse
      >("/auth/login", loginPayload)

      if (typeof window !== "undefined") {
        if (remember_me) {
          window.localStorage.setItem("remembered_email", payload.email)
        } else {
          window.localStorage.removeItem("remembered_email")
        }
      }

      const data = response.data as unknown as Record<string, unknown>
      if (data.requires_2fa === true && typeof data.temp_token === "string") {
        if (typeof window !== "undefined") {
          window.localStorage.setItem("temp_token", data.temp_token)
        }
        router.push("/login/verify-2fa")
        return
      }

      const auth = handleAuthPayload(data as unknown as AuthTokensPayload)
      setToken(auth.token)
      setUser(auth.user)
      toast.success("Logged in")
      router.push("/dashboard")
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "response" in error &&
        (error as { response?: { status?: number } }).response?.status === 401
      ) {
        toast.error("Invalid credentials")
      } else {
        toast.error("Failed to login")
      }
      throw error
    } finally {
      setLoading(false)
    }
  }

  const register: AuthContextValue["register"] = async (body) => {
    try {
      setLoading(true)
      const response = await api.post<AuthTokensPayload>(
        "/auth/register",
        body,
      )
      const auth = handleAuthPayload(response.data)
      setToken(auth.token)
      setUser(auth.user)
      toast.success("Account created")
      router.push("/dashboard")
    } catch (error) {
      const err = error as {
        response?: { data?: { message?: string; errors?: unknown } }
      }
      const msg = err.response?.data?.message ?? "Registration failed"
      toast.error(msg)
      throw error
    } finally {
      setLoading(false)
    }
  }

  const verifyTwoFactor: AuthContextValue["verifyTwoFactor"] = async (
    tempToken,
    code,
  ) => {
    try {
      setLoading(true)
      const response = await twoFactor.verify(tempToken, code)
      const auth = handleAuthPayload(response)
      setToken(auth.token)
      setUser(auth.user)
      toast.success("Logged in")
      if (typeof window !== "undefined") {
        window.localStorage.removeItem("temp_token")
      }
      router.push("/dashboard")
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "response" in error &&
        (error as { response?: { status?: number } }).response?.status === 422
      ) {
        toast.error("Invalid verification code")
      } else {
        toast.error("Failed to verify code")
      }
      throw error
    } finally {
      setLoading(false)
    }
  }

  const logout: AuthContextValue["logout"] = async () => {
    try {
      if (token) {
        await api.post("/auth/logout")
      }
    } catch {
    } finally {
      setToken(null)
      setUser(null)
      if (typeof window !== "undefined") {
        window.localStorage.removeItem("auth_token")
        window.localStorage.removeItem("auth_user")
      }
      toast.success("Logged out")
      router.push("/login")
    }
  }

  const value: AuthContextValue = {
    user,
    token,
    isAuthenticated: !!user && !!token,
    loading,
    login,
    register,
    logout,
    verifyTwoFactor,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider")
  }
  return ctx
}
