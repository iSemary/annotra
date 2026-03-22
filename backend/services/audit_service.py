import uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from models.audit_log import AuditLog


class AuditService:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def log(
        self,
        *,
        actor_user_id: uuid.UUID | None,
        company_id: uuid.UUID | None,
        action: str,
        resource_type: str,
        resource_id: str | None = None,
        meta: dict[str, Any] | None = None,
    ) -> None:
        self._session.add(
            AuditLog(
                actor_user_id=actor_user_id,
                company_id=company_id,
                action=action,
                resource_type=resource_type,
                resource_id=resource_id,
                meta=meta,
            )
        )
