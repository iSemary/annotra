"""Map annotation asset file_type to RBAC permission codes."""

from __future__ import annotations

from core.exceptions import AppException
from core.rbac import RequestContext

FILE_TYPES = frozenset({"image", "video", "audio", "dataset", "model_3d"})

# Coarse RBAC from initial seed; still granted to several roles.
LEGACY_ANNOTATIONS_READ = "annotations:read"
LEGACY_ANNOTATIONS_WRITE = "annotations:write"

READ_PERM = {
    "image": "annotations:image:read",
    "video": "annotations:video:read",
    "audio": "annotations:audio:read",
    "dataset": "annotations:dataset:read",
    "model_3d": "annotations:model_3d:read",
}

WRITE_PERM = {
    "image": "annotations:image:write",
    "video": "annotations:video:write",
    "audio": "annotations:audio:write",
    "dataset": "annotations:dataset:write",
    "model_3d": "annotations:model_3d:write",
}


def read_permission_for(file_type: str) -> str:
    return READ_PERM[file_type]


def write_permission_for(file_type: str) -> str:
    return WRITE_PERM[file_type]


def allowed_file_types_for_reads(ctx: RequestContext) -> list[str]:
    if ctx.is_superuser:
        return sorted(FILE_TYPES)
    if LEGACY_ANNOTATIONS_READ in ctx.permission_codes:
        return sorted(FILE_TYPES)
    return sorted(ft for ft in FILE_TYPES if READ_PERM[ft] in ctx.permission_codes)


def ensure_projects_read(ctx: RequestContext) -> None:
    if not ctx.is_superuser and "projects:read" not in ctx.permission_codes:
        raise AppException(403, "Missing permission: projects:read")


def ensure_can_read_file_type(ctx: RequestContext, file_type: str) -> None:
    if file_type not in FILE_TYPES:
        raise AppException(400, f"Invalid file_type: {file_type}")
    if ctx.is_superuser:
        return
    if LEGACY_ANNOTATIONS_READ in ctx.permission_codes:
        return
    if READ_PERM[file_type] not in ctx.permission_codes:
        raise AppException(403, f"Missing permission: {READ_PERM[file_type]}")


def ensure_can_write_file_type(ctx: RequestContext, file_type: str) -> None:
    if file_type not in FILE_TYPES:
        raise AppException(400, f"Invalid file_type: {file_type}")
    if ctx.is_superuser:
        return
    if LEGACY_ANNOTATIONS_WRITE in ctx.permission_codes:
        return
    if WRITE_PERM[file_type] not in ctx.permission_codes:
        raise AppException(403, f"Missing permission: {WRITE_PERM[file_type]}")
