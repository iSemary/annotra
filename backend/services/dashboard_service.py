from core.rbac import RequestContext


class DashboardService:
    @staticmethod
    def summary(ctx: RequestContext) -> dict:
        return {
            "company_id": str(ctx.company_id),
            "slug": ctx.company_slug,
            "user_id": str(ctx.user_id),
            "role": ctx.role_name,
        }
