import api from "./api"

export interface DashboardSummary {
  company_id: string
  slug: string
  user_id: string
  role: string
}

export async function getDashboardSummary(): Promise<DashboardSummary> {
  const response = await api.get<DashboardSummary>("/dashboard/summary")
  return response.data
}
