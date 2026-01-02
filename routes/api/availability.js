// routes/api/availability.js
import express from "express";
import { getStoreAvailability } from "../../services/bestbuyAvailability.js";
import retailStores from "../../config/retail-stores.json" assert { type: "json" };

const router = express.Router();

/**
 * POST /api/availability
 * body: { zipCode: "30303", skus: ["6602747"], conditions: ["fair","good","excellent"] }
 */
router.post("/", async (req, res) => {
  try {
    const { zipCode, skus, conditions } = req.body;

    if (!zipCode || !Array.isArray(skus) || !Array.isArray(conditions)) {
      return res.status(400).json({ error: "zipCode, skus[], conditions[] required" });
    }

    const { hits } = await getStoreAvailability({ zipCode, skus, conditions });

    // enrich with your retail store config (904 stores)
    const storeIndex = new Map(retailStores.map(s => [String(s.storeId), s]));
    const enriched = hits.map(h => ({
      ...h,
      store: storeIndex.get(String(h.storeId)) || null,
    }));

    res.json({ zipCode, skus, conditions, hits: enriched });
  } catch (e) {
    res.status(500).json({ error: e.message || String(e) });
  }
});

export default router;
