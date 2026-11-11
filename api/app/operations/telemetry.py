"""Allowlisted structured events only. Never pass exceptions, request URLs or payloads."""

import json
import logging

ALLOWED = {
    "request_failure",
    "queue_backlog",
    "global_ai_paused",
    "global_ai_resumed",
    "rate_limited",
    "rate_store_unavailable",
}
logger = logging.getLogger("selvora.operations")


def event(code):
    if code not in ALLOWED:
        code = "request_failure"
    logger.warning(json.dumps({"event": code}))


class SafeFormatter(logging.Formatter):
    def format(self, record):
        code = "runtime_event"
        if record.name == "selvora.operations":
            try:
                candidate = json.loads(record.msg).get("event")
                if candidate in ALLOWED:
                    code = candidate
            except (ValueError, TypeError, AttributeError):
                pass
        return json.dumps({"level": record.levelname, "event": code})
