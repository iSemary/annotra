import base64
import hashlib
import json

from cryptography.fernet import Fernet

from core.config import get_settings


def _fernet() -> Fernet:
    key = base64.urlsafe_b64encode(
        hashlib.sha256(get_settings().JWT_SECRET.encode("utf-8")).digest(),
    )
    return Fernet(key)


def encrypt_recovery_codes(codes: list[str]) -> str:
    return _fernet().encrypt(json.dumps(codes).encode("utf-8")).decode("utf-8")


def decrypt_recovery_codes(cipher: str) -> list[str]:
    raw = _fernet().decrypt(cipher.encode("utf-8"))
    data = json.loads(raw.decode("utf-8"))
    if not isinstance(data, list):
        return []
    return [str(x) for x in data]
