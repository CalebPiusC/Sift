import base64
import html
import re
from email.message import EmailMessage
from email.utils import parseaddr
from urllib.parse import quote

import httpx

from .base import Incoming, Outgoing


class ChannelError(Exception):
    def __init__(self, code: str, retryable: bool = True, ambiguous: bool = False):
        self.code, self.retryable, self.ambiguous = code, retryable, ambiguous
        super().__init__(code)


def decode_text(part: dict) -> str:
    if part.get("mimeType") == "text/plain":
        value = part.get("body", {}).get("data", "")
        return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4)).decode("utf-8", "replace")
    children = part.get("parts", [])
    texts = [decode_text(p) for p in children if p.get("mimeType") != "text/html"]
    if any(texts):
        return "\n".join(t for t in texts if t)
    if part.get("mimeType") == "text/html":
        value = part.get("body", {}).get("data", "")
        raw = base64.urlsafe_b64decode(value + "=" * (-len(value) % 4)).decode("utf-8", "replace")
        return html.unescape(re.sub("<[^>]*>", " ", raw))
    return "\n".join(decode_text(p) for p in children)


class GmailAdapter:
    base = "https://gmail.googleapis.com/gmail/v1/users/me"

    def __init__(self, token: str, client: httpx.AsyncClient):
        self.token, self.client = token, client

    async def request(self, method: str, path: str, **kwargs):
        try:
            response = await self.client.request(
                method,
                self.base + path,
                headers={"Authorization": f"Bearer {self.token}"},
                **kwargs,
            )
        except httpx.HTTPError:
            raise ChannelError("GMAIL_NETWORK", ambiguous=method == "POST") from None
        if response.status_code in (401, 403):
            raise ChannelError("GMAIL_REVOKED", retryable=False)
        if response.status_code == 429 or response.status_code >= 500:
            raise ChannelError(
                "GMAIL_TRANSIENT", ambiguous=method == "POST" and response.status_code >= 500
            )
        if response.status_code == 404:
            raise ChannelError("GMAIL_NOT_FOUND", retryable=False)
        if not response.is_success:
            raise ChannelError("GMAIL_REJECTED", retryable=False)
        return response.json()

    async def profile(self):
        return await self.request("GET", "/profile")

    async def receive(self, provider_id: str) -> Incoming:
        data = await self.request(
            "GET", f"/messages/{quote(provider_id, safe='')}", params={"format": "full"}
        )
        headers = {
            h["name"].lower(): h["value"] for h in data.get("payload", {}).get("headers", [])
        }
        name, address = parseaddr(
            headers.get("to" if "SENT" in data.get("labelIds", []) else "from", "")
        )
        return Incoming(
            data["id"],
            data["threadId"],
            address.casefold(),
            name[:200],
            decode_text(data.get("payload", {}))[:100000],
            headers.get("subject", "")[:500],
            headers.get("message-id", "")[:500],
            int(data.get("internalDate", 0)),
            "SENT" in data.get("labelIds", []),
        )

    async def fetch_history(self, history_id: str | None) -> tuple[list[str], str]:
        ids, page, latest = set(), None, history_id
        if history_id is None:
            latest = str((await self.profile())["historyId"])
        while True:
            params = {"maxResults": 100}
            if page:
                params["pageToken"] = page
            if history_id:
                params.update(startHistoryId=history_id, historyTypes="messageAdded")
                data = await self.request("GET", "/history", params=params)
                for event in data.get("history", []):
                    ids.update(m["message"]["id"] for m in event.get("messagesAdded", []))
                latest = data.get("historyId", latest)
            else:
                params["q"] = "in:inbox newer_than:7d"
                data = await self.request("GET", "/messages", params=params)
                ids.update(m["id"] for m in data.get("messages", []))
            page = data.get("nextPageToken")
            if not page:
                break
        if latest is None:
            latest = (await self.profile())["historyId"]
        return sorted(ids), str(latest)

    async def find_sent(self, rfc_id: str) -> str | None:
        data = await self.request(
            "GET",
            "/messages",
            params={"q": f"in:sent rfc822msgid:{rfc_id.strip('<>')}", "maxResults": 1},
        )
        return next((m["id"] for m in data.get("messages", [])), None)

    async def send(self, message: Outgoing) -> str:
        # Gmail authenticates the vendor account. No caller-supplied From or arbitrary headers.
        msg = EmailMessage()
        msg["To"] = message.recipient
        msg["Subject"] = (
            message.subject
            if message.subject.lower().startswith("re:")
            else "Re: " + message.subject
        )
        msg["Message-ID"] = message.rfc_id
        if message.in_reply_to:
            msg["In-Reply-To"] = message.in_reply_to
            msg["References"] = message.in_reply_to
        msg.set_content(message.text)
        raw = base64.urlsafe_b64encode(msg.as_bytes()).decode()
        data = await self.request(
            "POST", "/messages/send", json={"raw": raw, "threadId": message.thread_id}
        )
        return data["id"]

    async def watch(self, topic: str):
        return await self.request(
            "POST",
            "/watch",
            json={"topicName": topic, "labelIds": ["INBOX"], "labelFilterBehavior": "INCLUDE"},
        )

    def deep_link(self, thread_id: str) -> str:
        return "https://mail.google.com/mail/u/0/#all/" + quote(thread_id, safe="")
