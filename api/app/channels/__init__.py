from .base import Registry
from .gmail import GmailAdapter

registry = Registry()
registry.register("gmail", GmailAdapter)
