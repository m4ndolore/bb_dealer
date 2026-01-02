// services/storePinnedSearch.js
import { initBestBuySession } from "./bestbuyAvailability.js";
import { URLSearchParams } from "url";

export function buildStorePinnedUrl({ storeId, browsedCategory = "pcmcat748300666861", extraFacets = [], st }) {
  // qp facets are caret-separated in the decoded form
  // In URLs, ^ is usually preserved or encoded depending on builder.
  const facets = [
    `storepickupstores_facet=Store Availability - In Store Pickup~${storeId}`,
    ...extraFacets,
  ].join("^");

  const params = new URLSearchParams({
    browsedCategory,
    id: "pcat17071",
    qp: facets,
    st: st || `${browsedCategory}_categoryid$cat00000`,
  });

  return `https://www.bestbuy.com/site/searchpage.jsp?${params.toString()}`;
}

export async function fetchStorePinnedResults({ storeId, st, extraFacets = [] }) {
  const ctx = await initBestBuySession();
  const page = await ctx.newPage();

  const url = buildStorePinnedUrl({ storeId, st, extraFacets });
  await page.goto(url, { waitUntil: "domcontentloaded" });

  // Parse SKU tiles (Best Buy typically uses li.sku-item)
  const results = await page.$$eval("li.sku-item", nodes =>
    nodes.slice(0, 48).map(n => {
      const a = n.querySelector("a");
      const href = a?.getAttribute("href") || "";
      const text = (n.innerText || "").trim();

      // Try to extract SKU from href patterns
      let sku = null;
      const m1 = href.match(/skuId=(\d{7})/);
      const m2 = href.match(/\/sku\/(\d{7})/);
      sku = (m1 && m1[1]) || (m2 && m2[1]) || null;

      return { sku, href, text };
    })
  );

  await page.close();
  return { url, results };
}
