from enum import StrEnum


class MediaKind(StrEnum):
    """Stored on `media.kind` and used for size limits and dashboard filters."""

    IMAGE = "image"
    VIDEO = "video"
    AUDIO = "audio"
    MODEL_3D = "model_3d"


# Extensions we accept when MIME is generic (e.g. application/octet-stream).
AUDIO_FILE_EXTENSIONS: frozenset[str] = frozenset(
    {
        "mp3",
        "wav",
        "flac",
        "ogg",
        "m4a",
        "aac",
        "opus",
        "aif",
        "aiff",
        "caf",
    }
)

MODEL_FILE_EXTENSIONS: frozenset[str] = frozenset(
    {
        "obj",
        "mtl",
        "stl",
        "ply",
        "fbx",
        "dae",
        "gltf",
        "glb",
        "blend",
        "3ds",
        "usdz",
        "x3d",
        "wrl",
        "abc",
        "step",
        "stp",
    }
)

# MIME + storage extension + kind (single source of truth for typed uploads).
_MEDIA_TYPE_ROWS: list[tuple[str, str, MediaKind]] = [
    # Images
    ("image/jpeg", "jpg", MediaKind.IMAGE),
    ("image/png", "png", MediaKind.IMAGE),
    ("image/gif", "gif", MediaKind.IMAGE),
    ("image/webp", "webp", MediaKind.IMAGE),
    ("image/heic", "heic", MediaKind.IMAGE),
    ("image/heif", "heif", MediaKind.IMAGE),
    ("image/bmp", "bmp", MediaKind.IMAGE),
    ("image/tiff", "tiff", MediaKind.IMAGE),
    # Video
    ("video/mp4", "mp4", MediaKind.VIDEO),
    ("video/quicktime", "mov", MediaKind.VIDEO),
    ("video/webm", "webm", MediaKind.VIDEO),
    ("video/x-m4v", "m4v", MediaKind.VIDEO),
    ("video/3gpp", "3gp", MediaKind.VIDEO),
    # Audio
    ("audio/mpeg", "mp3", MediaKind.AUDIO),
    ("audio/mp3", "mp3", MediaKind.AUDIO),
    ("audio/wav", "wav", MediaKind.AUDIO),
    ("audio/x-wav", "wav", MediaKind.AUDIO),
    ("audio/wave", "wav", MediaKind.AUDIO),
    ("audio/flac", "flac", MediaKind.AUDIO),
    ("audio/ogg", "ogg", MediaKind.AUDIO),
    ("audio/webm", "webm", MediaKind.AUDIO),
    ("audio/aac", "aac", MediaKind.AUDIO),
    ("audio/mp4", "m4a", MediaKind.AUDIO),
    ("audio/x-m4a", "m4a", MediaKind.AUDIO),
    ("audio/opus", "opus", MediaKind.AUDIO),
    ("audio/aiff", "aiff", MediaKind.AUDIO),
    ("audio/x-aiff", "aiff", MediaKind.AUDIO),
    ("audio/x-caf", "caf", MediaKind.AUDIO),
    # 3D (explicit MIME where common)
    ("model/gltf+json", "gltf", MediaKind.MODEL_3D),
    ("model/gltf-binary", "glb", MediaKind.MODEL_3D),
    ("model/obj", "obj", MediaKind.MODEL_3D),
    ("model/stl", "stl", MediaKind.MODEL_3D),
    ("model/ply", "ply", MediaKind.MODEL_3D),
    ("model/vnd.usdz+zip", "usdz", MediaKind.MODEL_3D),
    ("model/x3d+xml", "x3d", MediaKind.MODEL_3D),
    ("model/vrml", "wrl", MediaKind.MODEL_3D),
    ("application/x-blender", "blend", MediaKind.MODEL_3D),
]

MIME_TO_EXTENSION: dict[str, str] = {r[0]: r[1] for r in _MEDIA_TYPE_ROWS}
MIME_TO_KIND: dict[str, MediaKind] = {r[0]: r[2] for r in _MEDIA_TYPE_ROWS}

GENERIC_MIMES_FOR_EXTENSION_MATCH: frozenset[str] = frozenset(
    {
        "application/octet-stream",
        "text/plain",
        "application/zip",
    }
)
