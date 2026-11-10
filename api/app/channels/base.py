from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True)
class Incoming:
    provider_id: str
    thread_id: str
    sender_email: str
    sender_name: str
    text: str
    subject: str
    rfc_id: str
    occurred_ms: int
    outgoing: bool = False


@dataclass(frozen=True)
class Outgoing:
    recipient: str
    text: str
    subject: str
    thread_id: str
    rfc_id: str
    in_reply_to: str


class ChannelAdapter(Protocol):
    async def receive(self, provider_id: str) -> Incoming: ...
    async def send(self, message: Outgoing) -> str: ...
    async def fetch_history(self, history_id: str | None) -> tuple[list[str], str]: ...
    def deep_link(self, thread_id: str) -> str: ...


class Registry:
    def __init__(self):
        self.factories = {}

    def register(self, name: str, factory):
        if name in self.factories:
            raise ValueError("Duplicate channel adapter")
        self.factories[name] = factory

    def create(self, name: str, *args) -> ChannelAdapter:
        if name not in self.factories:
            raise ValueError("Unsupported channel adapter")
        return self.factories[name](*args)
