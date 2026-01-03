// services/storePinnedSearch.js
import { initBestBuySession } from "./bestbuyAvailability.js";
import { URLSearchParams } from "url";

export function buildStorePinnedUrl({
  storeId,
  browsedCategory = "pcmcat748300666861",
  extraFacets = [],
  st,
}) {
  const facets = [
    `storepickupstores_facet=Store Availability - In Store Pickup~${storeId}`,
    ...extraFacets,
  ].join("^");

  const params = new URLSearchParams({
    browsedCategory,
    id: "pcat17071",
    qp: facets,
    st: st || "",
  });

  return `https://www.bestbuy.com/site/searchpage.jsp?${params.toString()}`;
}

export async function fetchStorePinnedResults({ storeId, st, extraFacets = [], browsedCategory }) {
  const ctx = await initBestBuySession();
  const page = await ctx.newPage();

  const url = buildStorePinnedUrl({ storeId, st, extraFacets, browsedCategory });
  await page.goto(url, { waitUntil: "domcontentloaded" });

  const results = await page.$$eval("li.sku-item", nodes =>
    nodes.slice(0, 50).map(n => {
      const titleEl = n.querySelector("h4.sku-title");
      const title = (titleEl?.innerText || "").trim();
      const linkEl = titleEl?.querySelector("a") || n.querySelector("a");
      const href = linkEl?.getAttribute("href") || "";

      const priceText = (n.querySelector(".priceView-customer-price")?.innerText ||
        n.querySelector(".priceView-hero-price")?.innerText ||
        n.querySelector(".priceView-layout-large")?.innerText ||
        "").trim();

      const openBoxText = (n.querySelector(".open-box-message")?.innerText ||
        n.querySelector(".open-box-condition")?.innerText ||
        n.querySelector(".open-box")?.innerText ||
        "").trim();

      let sku = null;
      const m1 = href.match(/skuId=(\d{7})/);
      const m2 = href.match(/\/sku\/(\d{7})/);
      sku = (m1 && m1[1]) || (m2 && m2[1]) || null;

      return {
        sku,
        href,
        title,
        priceText,
        openBoxText,
      };
    })
  );

  await page.close();
  return { url, results };
}
