import asyncio, json, re
from typing import Any, Dict, List, Tuple
from playwright.async_api import async_playwright

STORE_AVAIL_URL = "https://www.bestbuy.com/productfulfillment/c/api/2.0/storeAvailability"

# Paste the captured JSON payload here:
BASE_PAYLOAD: Dict[str, Any] = {
    # ...
}

SEED_ZIPS = [
    "30303", "89109", "10001", "19103", "60601", "63101", "77002",
    "90012", "94103", "98101", "80202", "15222", "43215"
]

def deep_copy(x): return json.loads(json.dumps(x))

def set_zip(payload: Dict[str, Any], zip_code: str) -> Dict[str, Any]:
    p = deep_copy(payload)

    # You will adjust this once you see your real payload fields.
    # Common patterns are location.postalCode / postalCode / searchPostalCode / destinationZip
    def mutate(obj):
        if isinstance(obj, dict):
            for k, v in obj.items():
                lk = k.lower()
                if lk in {"postalcode", "zipcode", "searchzipcode", "destinationzip"} and isinstance(v, str):
                    obj[k] = zip_code
                else:
                    mutate(v)
        elif isinstance(obj, list):
            for v in obj:
                mutate(v)

    mutate(p)
    return p

def build_store_index(resp: Dict[str, Any]) -> Dict[str, Dict[str, Any]]:
    """
    Find store metadata blocks; schema varies, so search for dicts that look like stores.
    """
    stores = {}

    def walk(x):
        if isinstance(x, dict):
            # heuristic: storeId/locationId + name + address-ish fields
            sid = x.get("storeId") or x.get("locationId") or x.get("storeID")
            name = x.get("name") or x.get("storeName")
            if sid and name:
                stores[str(sid)] = x
            for v in x.values():
                walk(v)
        elif isinstance(x, list):
            for v in x:
                walk(v)

    walk(resp)
    return stores

def extract_hits(resp: Dict[str, Any], target_sku="6602747") -> List[Dict[str, Any]]:
    hits = []
    stores = build_store_index(resp)

    for item in resp.get("items", []):
        if str(item.get("sku")) != target_sku:
            continue

        cond = str(item.get("condition"))
        for loc in item.get("locations", []):
            sid = str(loc.get("locationId"))
            av = loc.get("availability")
            if not av:
                continue

            qty = av.get("availablePickupQuantity", 0) or 0
            if qty > 0 and av.get("fulfillmentType") == "PICKUP":
                hits.append({
                    "sku": target_sku,
                    "condition_code": cond,
                    "storeId": sid,
                    "qty": qty,
                    "minDate": av.get("minDate"),
                    "maxDate": av.get("maxDate"),
                    "minPickupMinutes": av.get("minPickupMinutes"),
                    "maxPickupTime": av.get("maxPickupTime"),
                    "store": stores.get(sid)  # may include address/phone
                })

    return hits

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context()
        page = await context.new_page()
        await page.goto("https://www.bestbuy.com", wait_until="domcontentloaded")

        all_hits = {}
        for z in SEED_ZIPS:
            payload = set_zip(BASE_PAYLOAD, z)
            resp = await page.evaluate(
                """async ({url, payload}) => {
                    const r = await fetch(url, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(payload),
                        credentials: "include"
                    });
                    return await r.json();
                }""",
                {"url": STORE_AVAIL_URL, "payload": payload},
            )

            hits = extract_hits(resp, target_sku="6602747")
            print(f"{z}: hits={len(hits)}")

            for h in hits:
                all_hits[(h["sku"], h["storeId"], h["condition_code"])] = h

        with open("hits_6602747.json", "w") as f:
            json.dump(list(all_hits.values()), f, indent=2)

        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
