import api from "./api"

export interface DashboardSummary {
  company_id: string
  slug: string
  user_id: string
  role: string
}

export interface WorkspaceStats {
  projects_total: number
  projects_active: number
  annotation_assets_total: number
  annotations_total: number
  assets_by_type: Record<string, number>
  annotations_by_asset_type: Record<string, number>
}

export async function getDashboardSummary(): Promise<DashboardSummary> {
  const response = await api.get<DashboardSummary>("/dashboard/summary")
  return response.data
}

export async function getWorkspaceStats(): Promise<WorkspaceStats> {
  const response = await api.get<WorkspaceStats>("/dashboard/workspace-stats")
  return response.data
}
