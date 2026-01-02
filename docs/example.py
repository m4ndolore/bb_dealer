import asyncio, re, urllib.parse
from playwright.async_api import async_playwright

ZIP = "96734"
STORE_IDS = [2642, 2651, 2447, 2640, 2641, 2643, 2692]  # add more
TARGET_SKUS = {"6602747", "6602752", "6602753"}
# if you’re OK with Space Black etc., do NOT rely only on SKU; also match specs text.

BASE = "https://www.bestbuy.com/site/searchpage.jsp"
BROWSED_CAT = "pcmcat748300666861"
PCAT_ID = "pcat17071"

def build_qp(store_id: int) -> str:
    # Add facets here; you can extend with RAM, screen size, etc.
    facets = [
        f"storepickupstores_facet=Store Availability - In Store Pickup~{store_id}",
        "brand_facet=Brand~Apple",
    ]
    return "^".join(facets)

def build_url(store_id: int, st: str) -> str:
    params = {
        "browsedCategory": BROWSED_CAT,
        "id": PCAT_ID,
        "qp": build_qp(store_id),
        "st": st,
        "sp": "-currentprice",
    }
    return BASE + "?" + urllib.parse.urlencode(params, quote_via=urllib.parse.quote)

async def set_zip_if_possible(page):
    # Best Buy’s “ship to” controls vary. This is a best-effort:
    # try clicking the header location/zip element and entering ZIP.
    candidates = [
        "text=Change ZIP Code",
        "text=Change zip code",
        "text=Change Location",
        "text=Ship to",
        "button:has-text('Change')",
    ]
    for sel in candidates:
        loc = page.locator(sel)
        if await loc.count() > 0:
            await loc.first.click()
            await page.wait_for_timeout(500)
            break

    # try common input patterns
    for input_sel in ["input[type='text']", "input[type='search']"]:
        inp = page.locator(input_sel)
        if await inp.count() > 0:
            await inp.first.fill(ZIP)
            await page.keyboard.press("Enter")
            await page.wait_for_timeout(1200)
            return

async def extract_tiles(page):
    # Best Buy often uses li.sku-item tiles
    await page.wait_for_timeout(2000)
    tiles = page.locator("li.sku-item")
    n = await tiles.count()
    results = []
    for i in range(min(n, 50)):  # cap per store scan
        t = tiles.nth(i)
        txt = (await t.inner_text()) or ""
        link = t.locator("a")
        href = None
        if await link.count() > 0:
            href = await link.first.get_attribute("href")
        sku_match = re.search(r"skuId=(\d{7})", href or "")
        sku = sku_match.group(1) if sku_match else None
        results.append({"sku": sku, "href": href, "text": txt})
    return results

async def check_openbox_shipping(context, product_href: str):
    # open product page, then try to reach open-box.
    page = await context.new_page()
    await page.goto("https://www.bestbuy.com" + product_href, wait_until="domcontentloaded")
    await set_zip_if_possible(page)

    # Try clicking an “Open-Box” tab/link if present, else append /openbox
    openbox_link = page.locator("a:has-text('Open-Box')")
    if await openbox_link.count() > 0:
        await openbox_link.first.click()
        await page.wait_for_timeout(1500)
    else:
        # fallback: append /openbox (often redirects correctly)
        await page.goto(page.url.rstrip("/") + "/openbox", wait_until="domcontentloaded")
        await set_zip_if_possible(page)

    body = await page.locator("body").inner_text()

    # crude heuristics; tune once you see the exact text
    shipping_block = body.split("Shipping", 1)[-1][:250] if "Shipping" in body else ""
    shipping_available = ("Unavailable" not in shipping_block) and ("Not available" not in shipping_block)

    # try to capture an open-box price if visible
    price_match = re.search(r"\$[\d,]+\.\d{2}", body)
    price = price_match.group(0) if price_match else None

    await page.close()
    return shipping_available, price

async def main():
    search_terms = [
        "macbook pro 14 m4 max 36gb 1tb",
        "macbook pro 16 m4 pro 48gb 512gb",
        "macbook pro 16 m4 max 36gb 1tb",
    ]

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context()

        for store_id in STORE_IDS:
            for st in search_terms:
                url = build_url(store_id, st)
                page = await context.new_page()
                await page.goto(url, wait_until="domcontentloaded")
                tiles = await extract_tiles(page)
                await page.close()

                # Filter candidates: either matching known SKUs or matching strong text hints
                candidates = []
                for t in tiles:
                    if t["href"] and (t["sku"] in TARGET_SKUS or "M4" in t["text"]):
                        candidates.append(t)

                for c in candidates[:10]:
                    ship, price = await check_openbox_shipping(context, c["href"])
                    if ship:
                        print(f"[HIT] store {store_id} | {c['sku']} | {price} | {c['href']}")
                        # You can trigger a notification here (email/discord/sms)

        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
