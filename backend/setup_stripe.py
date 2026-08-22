"""Catálogo de Stripe (idempotente). Un producto SaaS con 4 precios: EUR/USD × mensual/anual."""
import os
import stripe
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).parent / ".env")
stripe.api_key = os.environ.get("STRIPE_SECRET_KEY") or "sk_test_emergent"

CATALOG = [
    {
        "emergent_product_id": "rawai_pro",
        "name": "RAW AI Studio Pro",
        "tax_code": "txcd_10103001",  # SaaS
        "prices": [
            {"lookup_key": "pro_monthly_eur", "amount": 4000,  "currency": "eur", "interval": "month"},
            {"lookup_key": "pro_annual_eur",  "amount": 30000, "currency": "eur", "interval": "year"},
            {"lookup_key": "pro_monthly_usd", "amount": 4400,  "currency": "usd", "interval": "month"},
            {"lookup_key": "pro_annual_usd",  "amount": 32400, "currency": "usd", "interval": "year"},
        ],
    },
]


def ensure_tax_settings(country="ES", line1="Calle Mayor 1", city="Madrid", state="", postal_code="28001"):
    s = stripe.tax.Settings.retrieve()
    if s.head_office and getattr(s.head_office, "address", None):
        return
    stripe.tax.Settings.modify(
        head_office={"address": {"country": country, "line1": line1,
                                 "city": city, "state": state, "postal_code": postal_code}},
        defaults={"tax_behavior": "exclusive"},
    )


def get_or_create_product(entry):
    for p in stripe.Product.list(active=True).auto_paging_iter():
        if p.to_dict().get("metadata", {}).get("emergent_product_id") == entry["emergent_product_id"]:
            return p
    return stripe.Product.create(
        name=entry["name"], tax_code=entry.get("tax_code"),
        metadata={"managed_by": "emergent", "emergent_product_id": entry["emergent_product_id"]},
    )


def run():
    try:
        ensure_tax_settings()
    except Exception as e:
        print("tax settings:", e)
    for entry in CATALOG:
        product = get_or_create_product(entry)
        for p in entry["prices"]:
            existing = stripe.Price.list(lookup_keys=[p["lookup_key"]], active=True, limit=1).data
            if existing and (existing[0].unit_amount != p["amount"] or existing[0].currency != p["currency"]):
                stripe.Price.modify(existing[0].id, active=False)
                existing = []
            if not existing:
                kwargs = dict(product=product.id, unit_amount=p["amount"], currency=p["currency"],
                              lookup_key=p["lookup_key"], transfer_lookup_key=True)
                if p.get("interval"):
                    kwargs["recurring"] = {"interval": p["interval"]}
                stripe.Price.create(**kwargs)
                print("created price", p["lookup_key"])
            else:
                print("exists", p["lookup_key"])


if __name__ == "__main__":
    run()
