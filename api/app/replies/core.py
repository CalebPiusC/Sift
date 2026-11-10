"""Pure policy and verification. No network, DB writes, tools or customer instructions."""

import re
from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal
from typing import Protocol

AUTO = frozenset(
    {
        "greeting",
        "price",
        "availability",
        "variants",
        "delivery_info",
        "order_status",
        "alternatives",
    }
)
MONEY = re.compile(
    r"(?<![\w.])(?:(?:₦|NGN\s*|N\s*)\s*\d+(?:,\d{3})*(?:\.\d+)?\s*[kK]?|\d+(?:\.\d+)?\s*[kK])(?!\w)",
    re.IGNORECASE,
)
INJECTION = re.compile(
    r"ignore.{0,40}(?:instructions|rules|previous)|system\s*prompt|developer\s*message|i am (?:the )?(?:owner|vendor|admin|manager)|na me (?:be )?(?:the )?owner|override|jailbreak|<\s*/?system",
    re.IGNORECASE | re.DOTALL,
)


def amounts(text: str) -> list[int]:
    result = []
    for match in MONEY.finditer(text):
        raw = (
            re.sub(r"^(?:₦|ngn|n)\s*", "", match.group().strip(), flags=re.IGNORECASE)
            .replace(",", "")
            .replace(" ", "")
        )
        multiplier = 100000 if raw.lower().endswith("k") else 100
        number = Decimal(raw.rstrip("kK")) * multiplier
        if number != number.to_integral_value() or number > 9007199254740991:
            raise ValueError("Invalid amount")
        result.append(int(number))
    return result


def midpoint(offer: int, floor: int, listed: int) -> int:
    if min(offer, floor, listed) < 0 or floor > listed:
        raise ValueError("Invalid negotiation facts")
    rounded = (
        int((Decimal(offer + listed) / 20000).quantize(Decimal(1), rounding=ROUND_HALF_UP)) * 10000
    )
    return max(floor, min(listed, rounded))


@dataclass(frozen=True)
class Detection:
    intent: str
    language: str
    confidence: float
    hostile: bool = False
    quantity: int = 1
    offer: int | None = None
    chat_tone: str = "neutral"


def detect(text: str) -> Detection:
    t = text.casefold()
    pcm = bool(re.search(r"\b(abeg|dey|wetin|una|how far|na|wahala|no vex|e go|fit|oga)\b", t))
    english = bool(
        re.search(
            r"\b(price|how much|available|please|hello|delivery|refund|discount|order|stock|can|want|have|give|take|sell|reduce|bulk|wholesale|custom|track|alternative)\b",
            t,
        )
    )
    language = (
        "mixed"
        if pcm and english
        else "pcm"
        if pcm
        else "en"
        if english or re.search(r"\b(hi|thanks|good morning|good afternoon|cost|size|colour)\b", t)
        else "other"
    )
    if any(c.isalpha() and ord(c) > 0x024F for c in text) or re.search(
        r"\b(bonjour|prix|hola|cuanto|merci|gracias|こんにちは)\b", t
    ):
        language = "other"
    quantity_match = re.search(r"\b(\d+)\s*(?:pieces?|pcs|units?|pairs?|items?|packs?)\b", t)
    quantity = int(quantity_match[1]) if quantity_match else 1
    hostile = bool(INJECTION.search(t))
    intent = "unknown_intent"
    rules = [
        ("refund", r"\b(refund|money back)\b"),
        ("complaint", r"\b(complaint|broken|damaged|scam|angry|wrong item|no vex)\b"),
        ("payment_claim", r"\b(paid|payment|transfer|receipt|screenshot|sent money)\b"),
        ("custom", r"\b(custom|bespoke|made to order|special request)\b"),
        ("bulk_order", r"\b(bulk|wholesale|dozen)\b"),
        (
            "discount",
            r"\b(discount|negotiate|last price|best price|give it for|take|fit do|reduce|sell for|free|dash)\b",
        ),
        ("delivery_info", r"\b(delivery|deliver|shipping|dispatch)\b"),
        ("order_status", r"\b(order status|where is my order|track)\b"),
        ("alternatives", r"\b(alternative|instead|other option)\b"),
        ("variants", r"\b(sizes?|colours?|colors?|variants?)\b"),
        ("price", r"\b(price|how much|cost|how mush|wetin.*price)\b"),
        ("availability", r"\b(available|availability|in stock|stock|dey|do you have)\b"),
        (
            "greeting",
            r"^(?:hi|hello|hey|good morning|good afternoon|good evening|how far|thanks|thank you)[!.?\s]*$",
        ),
    ]
    for name, pattern in rules:
        if re.search(pattern, t):
            intent = name
            break
    if quantity >= 10 and intent not in ("refund", "complaint", "payment_claim", "custom"):
        intent = "bulk_order"
    try:
        offers = amounts(text)
    except ValueError:
        return Detection(
            "injection" if hostile else "unknown_intent", language, 0.5, hostile, quantity
        )
    confidence = 0.98 if intent != "unknown_intent" and language != "other" else 0.5
    if hostile:
        intent = "injection"
        confidence = 0.99
    chat_tone = (
        "casual"
        if re.search(r"\b(abeg|hey|bro|oga|how far)\b", t)
        else "professional"
        if re.search(r"\b(dear|kindly|please|regards)\b", t)
        else "neutral"
    )
    return Detection(
        intent, language, confidence, hostile, quantity, offers[0] if offers else None, chat_tone
    )


@dataclass(frozen=True)
class Verdict:
    safe: bool
    errors: tuple[str, ...]


def selected(sheet: dict) -> dict | None:
    products = sheet.get("products", [])
    return products[0] if len(products) == 1 else None


def verify(text: str, sheet: dict) -> Verdict:
    """Conservative supported-claim grammar. Unsupported numeric/stock wording fails closed.

    Money spans are removed BEFORE quantity extraction: a price next to 'available' is
    never interpreted as a stock count. Equal numbers from unrelated facts cannot justify
    a claim: unit price, delivery, totals and negotiated prices have distinct contexts.
    """
    errors = []
    if re.search(r"[-−+]\s*(?:₦|NGN|N)\s*\d", text, re.IGNORECASE):
        errors.append("SIGNED_AMOUNT")
    p = selected(sheet)
    if not text.strip() or len(text) > 4000:
        errors.append("INVALID_TEXT")
    if INJECTION.search(text):
        errors.append("INSTRUCTION_ECHO")
    for clause in re.split(r"[;\n]|(?<=[.!?])\s+", text):
        low = clause.casefold()
        candidates = sheet.get("products", []) + sheet.get("alternatives", [])
        named = [item for item in candidates if item["name"].casefold() in low]
        p = named[0] if len(named) == 1 else selected(sheet) if not named else None
        try:
            values = amounts(clause)
        except ValueError:
            values = []
            errors.append("INVALID_AMOUNT")
        if values:
            expected = None
            if re.search(r"\b(delivery|shipping|dispatch)\b", low):
                fees = [
                    f["fee_kobo"]
                    for f in sheet.get("delivery", [])
                    if re.search(r"\b" + re.escape(f["city"].casefold()) + r"\b", low)
                ]
                expected = fees[0] if len(fees) == 1 else None
            elif re.search(r"\b(total|altogether)\b", low):
                expected = sheet.get("total_kobo")
            elif p:
                expected = sheet.get("negotiated_kobo", p["price_kobo"])
            if expected is None or any(v != expected for v in values):
                errors.append("UNBACKED_AMOUNT")
            # Bind amount to a supported full claim, not merely a coincidentally equal
            # number from another fact. Unknown subjects/cities/unit bases fail closed.
            normalized = MONEY.sub("AMOUNT", low).strip().rstrip(".!?")
            normalized = re.sub(r"^(?:abeg,|hi!|thank you\.)\s*", "", normalized)
            if re.search(r"\b(delivery|shipping|dispatch)\b", low):
                fee = next(
                    (f for f in sheet.get("delivery", []) if f["city"].casefold() in low), None
                )
                grammar = (
                    r"(?:delivery(?: fee)?|shipping|dispatch) to "
                    + re.escape(fee["city"].casefold())
                    + r" (?:costs|is|:) AMOUNT"
                    if fee
                    else r"(?!)"
                )
            elif re.search(r"\b(total|altogether)\b", low):
                grammar = r"(?:total|altogether)\s*(?:is|:)?\s*AMOUNT"
            elif p:
                name = re.escape(p["name"].casefold())
                grammar = (
                    r"(?:(?:"
                    + name
                    + r"\s*(?:costs?|is|:)\s*)|(?:our offer for "
                    + name
                    + r" is )|(?:(?:price|cost)\s*(?:is|:)?\s*))?AMOUNT(?: available)?"
                )
            else:
                grammar = r"(?!)"
            if not re.fullmatch(grammar, normalized):
                errors.append("UNSUPPORTED_AMOUNT_WORDING")
        stripped = MONEY.sub(" ", low)
        if p:
            stripped = stripped.replace(p["name"].casefold(), " ")
        stock_mentioned = bool(re.search(r"\b(stock|available|left|remaining|dey)\b", stripped))
        if (
            not values
            and re.search(r"\b(deliver|delivery|shipping|dispatch)\b", stripped)
            and not (
                re.search(r"\b(free delivery|free shipping)\b", stripped)
                and any(
                    f["fee_kobo"] == 0 and f["city"].casefold() in low
                    for f in sheet.get("delivery", [])
                )
            )
        ):
            errors.append("UNBACKED_DELIVERY")
        if (
            re.search(
                r"\b(free|complimentary|half price|on the house|cheaper|discounted)\b", stripped
            )
            and not re.search(r"\b(free delivery|free shipping)\b", stripped)
            and (not p or sheet.get("negotiated_kobo", p["price_kobo"]) != 0)
        ):
            errors.append("UNBACKED_DISCOUNT")
        if re.search(r"\b(paid|payment|transfer|receipt|screenshot)\b", stripped) and not sheet.get(
            "payment_verified"
        ):
            errors.append("UNVERIFIED_PAYMENT")
        stock_patterns = [
            r"\b(\d+)\s*(?:pieces?|pcs|units?|pairs?|items?|packs?)\s*(?:are\s+)?(?:left|available|in stock|dey)",
            r"\b(?:stock|remaining|left)\s*(?:is|:|=)?\s*(\d+)\b",
            r"\b(\d+)\s+(?:left|in stock|available)\b",
        ]
        for pattern in stock_patterns:
            for match in re.finditer(pattern, stripped):
                if not p or p.get("stock_count") is None or int(match[1]) != p["stock_count"]:
                    errors.append("UNBACKED_STOCK")
                stripped = stripped.replace(match.group(), " ")
        if re.search(r"\b(out of stock|sold out|no stock|not available)\b", stripped):
            if not p or p.get("stock_count") != 0:
                errors.append("UNBACKED_STOCK")
            stripped = re.sub(r"\b(out of stock|sold out|no stock|not available)\b", " ", stripped)
        if (
            re.search(r"\b(in stock|stock available|available|we have|we get|dey)\b", stripped)
            and not values
            and (not p or p.get("stock_count") is None or p["stock_count"] <= 0)
        ):
            errors.append("UNBACKED_STOCK")
        if re.search(
            r"\b(unlimited|infinite|unlimited|plenty|many|few|several|some|no|zero|one|two|three|four|five|six|seven|eight|nine|ten)\b.{0,20}\b(stock|remaining|left|available|pieces|units)\b",
            stripped,
        ):
            errors.append("UNSUPPORTED_STOCK_WORDING")
        if stock_mentioned and not values:
            residual = re.sub(
                r"\b(in stock|stock available|available|out of stock|sold out|no stock|not available|we have|we get|dey|currently|now|is|are|it)\b",
                " ",
                stripped,
            )
            if re.search(r"[a-z]", residual):
                errors.append("UNSUPPORTED_STOCK_WORDING")
        # Only an explicit authorized quantity is allowed outside money/stock claims.
        stripped = re.sub(
            r"\bquantity\s*:\s*" + str(sheet.get("quantity", 1)) + r"\b", " ", stripped
        )
        if re.search(r"\d", stripped):
            errors.append("UNCLASSIFIED_NUMBER")
        if re.search(
            r"\b(payment confirmed|payment received|you have paid|order is paid)\b", low
        ) and not sheet.get("payment_verified"):
            errors.append("UNVERIFIED_PAYMENT")
        if re.search(r"\b(free delivery|free shipping)\b", low) and not any(
            f["fee_kobo"] == 0 and f["city"].casefold() in low for f in sheet.get("delivery", [])
        ):
            errors.append("UNBACKED_DELIVERY")
    return Verdict(not errors, tuple(sorted(set(errors))))


class WordingWriter(Protocol):
    def write(self, detection: Detection, sheet: dict, tone: str) -> str: ...


def naira(kobo: int) -> str:
    return "₦" + f"{Decimal(kobo) / 100:,.2f}".rstrip("0").rstrip(".")


class TemplateWriter:
    """Default wording adapter: no model sees customer text as an instruction or sets facts."""

    def write(self, detection: Detection, sheet: dict, tone: str) -> str:
        p = selected(sheet)
        casual = tone == "Pidgin-friendly" and detection.language in ("pcm", "mixed")
        prefix = (
            "Abeg, "
            if casual
            else "Thank you. "
            if tone == "professional" or detection.chat_tone == "professional"
            else "Hi! "
        )
        if detection.intent == "greeting":
            return prefix + ("how we fit help you?" if casual else "How can we help you today?")
        if detection.intent == "price" and p:
            return prefix + f"{p['name']} costs {naira(p['price_kobo'])}."
        if detection.intent == "discount" and p and sheet.get("negotiated_kobo") is not None:
            return prefix + f"Our offer for {p['name']} is {naira(sheet['negotiated_kobo'])}."
        if detection.intent == "availability" and p and p.get("stock_count") is not None:
            return prefix + (
                f"{p['name']}: {p['stock_count']} units in stock."
                if p["stock_count"]
                else f"{p['name']} is out of stock."
            )
        if detection.intent == "delivery_info" and len(sheet.get("delivery", [])) == 1:
            f = sheet["delivery"][0]
            return prefix + f"Delivery to {f['city']} costs {naira(f['fee_kobo'])}."
        if detection.intent == "order_status" and sheet.get("order_status"):
            return prefix + "Your order status is " + sheet["order_status"].replace("_", " ") + "."
        if detection.intent == "alternatives" and sheet.get("alternatives"):
            return (
                prefix
                + "; ".join(
                    f"{a['name']} costs {naira(a['price_kobo'])}" for a in sheet["alternatives"]
                )
                + "."
            )
        if detection.intent == "variants" and p and p.get("variants"):
            return (
                prefix
                + "The listed options are: "
                + ", ".join(v["name"] for v in p["variants"])
                + "."
            )
        return "Thank you for your enquiry. The team will review your request and get back to you."


@dataclass(frozen=True)
class Decision:
    lane: str
    reason: str
    text: str
    detection: Detection
    blocked: tuple[str, ...]


def decide(
    text: str,
    sheet: dict,
    auto_intents=AUTO,
    tone="friendly",
    auto_negotiation=False,
    writer: WordingWriter | None = None,
) -> Decision:
    d = detect(text)
    p = selected(sheet)
    reason = "auto_intent"
    if d.hostile:
        reason = "prompt_injection"
    elif d.intent == "payment_claim":
        reason = "unverified_payment"
    elif d.confidence < 0.75:
        reason = "low_confidence"
    elif d.intent in ("bulk_order", "custom", "complaint", "refund"):
        reason = d.intent
    elif d.intent == "discount":
        if not p or d.offer is None:
            reason = "unknown_intent"
        elif d.offer < p["lowest_price_kobo"]:
            reason = "discount_below_floor"
        elif not auto_negotiation:
            reason = "negotiation_disabled"
        else:
            sheet["negotiated_kobo"] = midpoint(d.offer, p["lowest_price_kobo"], p["price_kobo"])
    elif d.intent not in AUTO:
        reason = "unknown_intent"
    elif d.intent not in set(auto_intents):
        reason = "intent_disabled"
    if (
        reason == "auto_intent"
        and d.intent in ("price", "availability", "variants", "alternatives")
        and not p
    ):
        reason = "missing_facts"
    if reason == "auto_intent" and (
        (d.intent == "availability" and p and p.get("stock_count") is None)
        or (d.intent == "variants" and not (p or {}).get("variants"))
        or (d.intent == "delivery_info" and len(sheet.get("delivery", [])) != 1)
        or (d.intent == "order_status" and not sheet.get("order_status"))
        or (d.intent == "alternatives" and not sheet.get("alternatives"))
    ):
        reason = "missing_facts"
    if (
        reason == "auto_intent"
        and p
        and (
            d.quantity < 1
            or (
                p.get("stock_count") is not None
                and d.quantity > 1
                and d.quantity > p["stock_count"]
            )
        )
    ):
        reason = "insufficient_stock"
    reply = (
        (writer or TemplateWriter()).write(d, sheet, tone)
        if reason == "auto_intent"
        else TemplateWriter().write(
            Detection("unknown_intent", d.language, d.confidence), sheet, tone
        )
    )
    verdict = verify(reply, sheet)
    if not verdict.safe:
        reason = "unverified_facts"
    return Decision(
        "auto" if reason == "auto_intent" else "approval", reason, reply, d, verdict.errors
    )
