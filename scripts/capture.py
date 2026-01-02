import asyncio
from playwright.async_api import async_playwright

OPENBOX_URL = "https://www.bestbuy.com/product/apple-macbook-pro-14-inch-laptop-apple-m4-max-chip-built-for-apple-intelligence-36gb-memory-1tb-ssd-silver/6602747/openbox?condition=fair"
TARGET_ENDPOINT = "/productfulfillment/c/api/2.0/storeAvailability"

async def capture_payload():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False)  # show UI once
        context = await browser.new_context()
        page = await context.new_page()

        payload_holder = {"payload": None}

        async def on_request(req):
            if TARGET_ENDPOINT in req.url and req.method == "POST":
                try:
                    payload_holder["payload"] = req.post_data_json
                except Exception:
                    payload_holder["payload"] = req.post_data

        page.on("request", on_request)

        await page.goto(OPENBOX_URL, wait_until="domcontentloaded")

        # Open the pickup sidebar (selectors may need a tweak)
        for sel in ["text=Choose Pickup Location", "text=Select Pickup Location"]:
            loc = page.locator(sel)
            if await loc.count():
                await loc.first.click()
                break

        # Enter a seed ZIP (any metro where it’s known to show results)
        inp = page.locator("input[type='search'], input[type='text']").first
        await inp.fill("30303")
        await page.keyboard.press("Enter")

        # Wait until we capture the POST
        for _ in range(50):
            if payload_holder["payload"] is not None:
                break
            await page.wait_for_timeout(200)

        await browser.close()
        return payload_holder["payload"]

if __name__ == "__main__":
    payload = asyncio.run(capture_payload())
    print(payload)
