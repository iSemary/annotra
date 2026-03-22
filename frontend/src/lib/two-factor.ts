import api, {
  type TwoFactorSetupResponse,
  type TwoFactorConfirmResponse,
  type TwoFactorVerifyResponse,
} from "./api"

export const twoFactor = {
  setup: async (): Promise<TwoFactorSetupResponse> => {
    const response = await api.post<TwoFactorSetupResponse>("/auth/2fa/setup")
    return response.data
  },

  confirm: async (
    code: string,
    secret: string,
  ): Promise<TwoFactorConfirmResponse> => {
    const response = await api.post<TwoFactorConfirmResponse>(
      "/auth/2fa/confirm",
      { code, secret },
    )
    return response.data
  },

  verify: async (
    tempToken: string,
    code: string,
  ): Promise<TwoFactorVerifyResponse> => {
    const response = await api.post<TwoFactorVerifyResponse>(
      "/auth/2fa/verify",
      { code, temp_token: tempToken },
    )
    return response.data
  },

  disable: async (): Promise<{ message: string }> => {
    const response = await api.post<{ message: string }>("/auth/2fa/disable")
    return response.data
  },

  getRecoveryCodes: async (): Promise<{ recovery_codes: string[] }> => {
    const response = await api.get<{ recovery_codes: string[] }>(
      "/auth/2fa/recovery-codes",
    )
    return response.data
  },
}

export type {
  TwoFactorSetupResponse,
  TwoFactorConfirmResponse,
  TwoFactorVerifyResponse,
}
