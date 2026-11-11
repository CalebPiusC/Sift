from .base import Registry
from .gmail import GmailAdapter

registry = Registry()
registry.register("gmail", GmailAdapter)


def whatsapp_adapter(*args, **kwargs):
    # Lazy import avoids a cycle when the WhatsApp boundary is imported first.
    from app.whatsapp.cloud import Cloud

    return Cloud(*args, **kwargs)


registry.register("whatsapp", whatsapp_adapter)
