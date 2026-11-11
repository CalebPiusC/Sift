"""Context-bound encryption. Keys/peppers are secret runtime configuration, never SQL values."""

import base64
import hashlib
import hmac
import json
import os
import time

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from app.config import Settings


def b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode().rstrip("=")


def unb64(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


class Crypto:
    def __init__(self, settings: Settings):
        self.keys = {
            k: unb64(v) for k, v in json.loads(settings.pipeline_keys.get_secret_value()).items()
        }
        self.version = settings.pipeline_key_version
        self.pepper = unb64(settings.identity_pepper.get_secret_value())
        if (
            self.version not in self.keys
            or any(len(k) != 32 for k in self.keys.values())
            or len(self.pepper) < 32
        ):
            raise ValueError("Invalid pipeline key configuration")

    def digest(self, purpose: str, value: str) -> str:
        return hmac.new(self.pepper, (purpose + ":" + value).encode(), hashlib.sha256).hexdigest()

    def seal(self, value: bytes, context: str) -> bytes:
        nonce = os.urandom(12)
        return nonce + AESGCM(self.keys[self.version]).encrypt(nonce, value, context.encode())

    def open(self, value: bytes, version: str, context: str) -> bytes:
        return AESGCM(self.keys[version]).decrypt(value[:12], value[12:], context.encode())

    def cursor(self, data: dict) -> str:
        body = b64(
            json.dumps({**data, "expires": int(time.time()) + 3600}, sort_keys=True).encode()
        )
        return body + "." + self.digest("cursor", body)

    def read_cursor(self, token: str, scope: dict) -> dict:
        try:
            body, signature = token.split(".")
            if not hmac.compare_digest(signature, self.digest("cursor", body)):
                raise ValueError()
            data = json.loads(unb64(body))
            if data["expires"] < time.time() or any(data.get(k) != v for k, v in scope.items()):
                raise ValueError()
            return data
        except (ValueError, KeyError, TypeError):
            raise ValueError("Invalid cursor") from None
