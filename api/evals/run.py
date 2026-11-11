"""Build gate: stdlib-only, executable without provider credentials or Python dependencies."""

import json
import sys
from copy import deepcopy
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.replies.core import decide, verify


def run():
    corpus = json.loads(Path(__file__).with_name("messages.json").read_text())
    if len(corpus) < 100:
        raise AssertionError("At least 100 evaluation messages required")
    sheet = {
        "products": [
            {
                "id": "ankara",
                "name": "Ankara",
                "price_kobo": 1500000,
                "lowest_price_kobo": 1200000,
                "stock_count": 8,
                "revision": 1,
                "variants": [{"name": "Medium"}],
            }
        ],
        "delivery": [{"id": "lagos", "city": "Lagos", "fee_kobo": 250000}],
        "quantity": 1,
        "total_kobo": 1750000,
        "order_status": "processing",
        "orders": [],
        "payment_verified": False,
    }
    auto = blocked = 0
    for i, item in enumerate(corpus, 1):
        facts = deepcopy(sheet)
        d = decide(item["text"], facts)
        print(
            f"{i:03d} [{item['kind']}] {d.detection.language} confidence={d.detection.confidence:.2f} lane={d.lane} reason={d.reason} | {item['text']}"
        )
        if d.lane == "auto":
            auto += 1
            if not verify(d.text, facts).safe:
                raise AssertionError(f"UNSAFE EMITTED REPLY {i}: {d.text}")
        else:
            blocked += 1
            print(f"  BLOCKED FROM AUTO: {d.text} | verifier={d.blocked}")
        if item.get("lane") and d.lane != item["lane"]:
            raise AssertionError(f"Unexpected lane in case {i}: {d.lane}")
    # Deliberately unsafe wording must be caught, not merely avoided by the default writer.
    for text in [
        "Ankara costs N100",
        "500 units in stock",
        "Stock: 15",
        "Total N1.5k",
        "Delivery to Lagos costs 15k",
        "Payment confirmed",
        "Free delivery to Lagos",
        "Ankara costs -N15,000",
    ]:
        verdict = verify(text, sheet)
        print(f"  BLOCKED REPLY: {text} | {verdict.errors}")
        if verdict.safe:
            raise AssertionError("Verifier admitted unsafe reply: " + text)
    if not auto or not blocked:
        raise AssertionError("Evaluation must exercise both lanes")
    print(
        f"PASS: {len(corpus)} messages; {auto} auto / {blocked} approval; zero unbacked emitted prices or stock counts"
    )


if __name__ == "__main__":
    run()
