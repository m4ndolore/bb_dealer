import asyncio
import json
import re
from typing import Dict, List, Set, Tuple
from playwright.async_api import async_playwright, TimeoutError as PWTimeout

OPENBOX_URL = "https://www.bestbuy.com/product/apple-macbook-pro-14-inch-laptop-apple-m4-max-chip-built-for-apple-intelligence-36gb-memory-1tb-ssd-silver/6602747/openbox?condition=fair"

# Start with metros + add more later (grid/centroids)
SEED_LOCATIONS = [
    "30303",  # Atlanta
    "89109",  # Las Vegas
    "10001",  # NYC
    "19103",  # Philly
    "15222",  # Pittsburgh
    "43215",  # Columbus
    "60601",  # Chicago
    "63101",  # St. Louis
    "66204",  # Overland Park
    "77002",  # Houston
    "90012",  # Los Angeles
    "94103",  # San Francisco
    "98101",  # Seattle
]

def normalize_whitespace(s: str) -> str:
    return re.sub(r"\s+", " ", s).strip()

async def open_pickup_sidebar(page) -> bool:
    # Try a few button texts
    candidates = [
        "text=Choose Pickup Location",
        "text=Select Pickup Location",
        "text=Check other stores",
        "text=See pickup options",
        "text=Pickup at another store",
    ]
    for sel in candidates:
        loc = page.locator(sel)
        if await loc.count() > 0:
            await loc.first.click()
            return True

    # Sometimes it’s a button near fulfillment module
    # Attempt generic: any button containing "Pickup Location"
    btn = page.locator("button:has-text('Pickup Location')")
    if await btn.count() > 0:
        await btn.first.click()
        return True

    return False

async def fill_sidebar_location(page, location: str):
    # Sidebar often has an input like "City, State or ZIP"
    inputs = [
        "input[placeholder*='ZIP']",
        "input[aria-label*='ZIP']",
        "input[placeholder*='City']",
        "input[aria-label*='City']",
        "input[type='search']",
        "input[type='text']",
    ]
    for sel in inputs:
        inp = page.locator(sel)
        if await inp.count() > 0:
            await inp.first.fill(location)
            await page.keyboard.press("Enter")
            return
    raise RuntimeError("Could not find pickup location input in sidebar")

async def parse_store_cards(page) -> List[Dict]:
    # Heuristic: store cards often include store name/address and a “Select” or “Pick up here” action
    # We'll just scrape visible text blocks and extract store-ish data.
    await page.wait_for_timeout(1500)

    # Broad selectors for cards / list items
    card_selectors = ["[data-testid*='store']", "li:has-text('Best Buy')", "div:has-text('Best Buy')"]
    cards = None
    for sel in card_selectors:
        loc = page.locator(sel)
        if await loc.count() >= 2:  # too many divs otherwise; tweak if needed
            cards = loc
            break

    results = []
    if cards is None:
        # Fallback: just get sidebar text; you can tune selector after first run
        sidebar_text = await page.locator("body").inner_text()
        return [{"raw": normalize_whitespace(sidebar_text)}]

    n = await cards.count()
    for i in range(min(n, 30)):
        t = await cards.nth(i).inner_text()
        t = normalize_whitespace(t)
        if len(t) < 30:
            continue
        # Basic parsing
        # Try to find storeId in any href inside the card
        hrefs = cards.nth(i).locator("a")
        store_id = None
        if await hrefs.count() > 0:
            for j in range(min(await hrefs.count(), 5)):
                href = await hrefs.nth(j).get_attribute("href")
                if not href:
                    continue
                # Common patterns include storeId=#### or /site/store/####.p
                m = re.search(r"(?:storeId=|/site/store/)(\d{3,5})", href)
                if m:
                    store_id = m.group(1)
                    break

        available = any(k in t.lower() for k in ["available", "as soon as", "ready", "pickup"])
        results.append({"store_id": store_id, "text": t, "available_hint": available})

    return results

async def scan_seed(context, seed: str) -> List[Dict]:
    page = await context.new_page()
    # Important: block geolocation prompts so it doesn't override your typed location
    await context.grant_permissions([], origin="https://www.bestbuy.com")

    await page.goto(OPENBOX_URL, wait_until="domcontentloaded")

    # If the page itself says "Unavailable", we still proceed—because you can often open the sidebar anyway
    opened = await open_pickup_sidebar(page)
    if not opened:
        await page.close()
        return []

    await fill_sidebar_location(page, seed)

    # Wait for results to refresh
    await page.wait_for_timeout(2000)

    stores = await parse_store_cards(page)
    await page.close()
    return stores

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            viewport={"width": 1400, "height": 900},
            locale="en-US",
        )

        found: Dict[str, Dict] = {}
        for seed in SEED_LOCATIONS:
            try:
                stores = await scan_seed(context, seed)
                for s in stores:
                    sid = s.get("store_id") or f"unknown:{seed}:{hash(s.get('text',''))}"
                    # Keep best record (prefer ones with availability hints)
                    if sid not in found or (s.get("available_hint") and not found[sid].get("available_hint")):
                        found[sid] = {"seed": seed, **s}
                print(f"[seed {seed}] stores scraped: {len(stores)} | unique stores total: {len(found)}")
            except PWTimeout:
                print(f"[seed {seed}] timeout")
            except Exception as e:
                print(f"[seed {seed}] error: {e}")

        await browser.close()

    # Save results
    with open("stores_found.json", "w") as f:
        json.dump(found, f, indent=2)

    # Print likely hits
    hits = [v for v in found.values() if v.get("available_hint")]
    print("\nLIKELY AVAILABILITY HITS (heuristic):")
    for h in hits[:50]:
        print("-", h.get("store_id"), "| seed", h.get("seed"), "|", h.get("text")[:160], "...")

if __name__ == "__main__":
    asyncio.run(main())
