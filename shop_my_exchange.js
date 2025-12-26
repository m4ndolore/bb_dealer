const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

const requireEnv = (key) => {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required env var: ${key}`);
  return value;
};

const optionalEnv = (key, fallback = undefined) => process.env[key] ?? fallback;

const parseNumber = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const parseList = (value) => {
  if (!value) return [];
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
};

const parseThresholds = (value) => {
  const entries = parseList(value)
    .map((entry) => parseNumber(entry))
    .filter((entry) => entry !== null);
  return entries.length ? entries : null;
};

const loadPayload = () => {
  const payloadText = optionalEnv('MONETATE_DECIDE_PAYLOAD');
  if (payloadText) {
    return JSON.parse(payloadText);
  }

  const payloadFile = optionalEnv('MONETATE_DECIDE_PAYLOAD_FILE');
  if (!payloadFile) {
    throw new Error('Missing required env var: MONETATE_DECIDE_PAYLOAD or MONETATE_DECIDE_PAYLOAD_FILE');
  }

  const payloadPath = path.resolve(payloadFile);
  return JSON.parse(fs.readFileSync(payloadPath, 'utf8'));
};

const flattenItems = (payload) => {
  const responses = payload?.data?.responses ?? [];
  return responses.flatMap((response) =>
    (response.actions ?? []).flatMap((action) => action.items ?? [])
  );
};

const normalizeItem = (item, baseUrl) => {
  const price = parseNumber(item.price);
  const salePrice = parseNumber(item.salePrice ?? item.saleprice);
  const discountPercent =
    price && salePrice !== null && salePrice <= price
      ? ((price - salePrice) / price) * 100
      : 0;

  const itemLink = item.link ? `${item.link}` : null;
  const fullLink = baseUrl && itemLink ? `${baseUrl}${itemLink}` : itemLink;

  return {
    id: item.id ?? item.itemGroupId ?? item.recSetId,
    title: item.title ?? 'Untitled',
    brand: item.brand ?? null,
    price,
    salePrice,
    discountPercent,
    quantity: parseNumber(item.quantity),
    link: fullLink,
    imageLink: item.imageLink ?? null,
    raw: item,
  };
};

const formatPrice = (value) => (value === null ? 'n/a' : `$${value.toFixed(2)}`);

const meetsCriteria = (item, criteria) => {
  if (criteria.minDiscount !== null && item.discountPercent < criteria.minDiscount) {
    return false;
  }

  if (criteria.maxDiscount !== null && item.discountPercent > criteria.maxDiscount) {
    return false;
  }

  if (criteria.minPrice !== null && (item.salePrice ?? item.price ?? 0) < criteria.minPrice) {
    return false;
  }

  if (criteria.maxPrice !== null && (item.salePrice ?? item.price ?? 0) > criteria.maxPrice) {
    return false;
  }

  if (criteria.minQuantity !== null && (item.quantity ?? 0) < criteria.minQuantity) {
    return false;
  }

  if (criteria.brands.length && item.brand) {
    const brandMatch = criteria.brands.some((brand) =>
      item.brand.toLowerCase().includes(brand.toLowerCase())
    );
    if (!brandMatch) return false;
  }

  if (criteria.brands.length && !item.brand) {
    return false;
  }

  return true;
};

const sendWebhook = async (url, payload) => {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Webhook failed (${response.status}): ${text.slice(0, 200)}`);
  }
};

const main = async () => {
  const monetateUrl = requireEnv('MONETATE_API_URL');
  const requestPayload = loadPayload();
  const baseUrl = optionalEnv('SHOPMYEXCHANGE_BASE_URL');

  const minDiscount = parseNumber(optionalEnv('MIN_DISCOUNT_PERCENT'));
  const maxDiscount = parseNumber(optionalEnv('MAX_DISCOUNT_PERCENT'));
  const minPrice = parseNumber(optionalEnv('MIN_PRICE'));
  const maxPrice = parseNumber(optionalEnv('MAX_PRICE'));
  const minQuantity = parseNumber(optionalEnv('MIN_QUANTITY'));
  const brands = parseList(optionalEnv('BRANDS'));
  const thresholds =
    parseThresholds(optionalEnv('DISCOUNT_THRESHOLDS')) ??
    (minDiscount !== null ? [minDiscount] : []);

  const response = await fetch(monetateUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestPayload),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Monetate request failed (${response.status}): ${text.slice(0, 200)}`);
  }

  const payload = await response.json();
  const normalizedItems = flattenItems(payload).map((item) => normalizeItem(item, baseUrl));

  const criteria = {
    minDiscount,
    maxDiscount,
    minPrice,
    maxPrice,
    minQuantity,
    brands,
  };

  const filteredItems = normalizedItems.filter((item) => meetsCriteria(item, criteria));
  const sortedItems = filteredItems.sort((a, b) => b.discountPercent - a.discountPercent);

  console.log(`Found ${sortedItems.length} items after filtering.`);

  sortedItems.forEach((item) => {
    console.log(
      `- ${item.title} | ${item.brand ?? 'Unknown brand'} | ${formatPrice(item.salePrice ?? item.price)} ` +
        `(orig ${formatPrice(item.price)}) | ${item.discountPercent.toFixed(1)}% off | qty ${
          item.quantity ?? 'n/a'
        } | ${item.link ?? 'no link'}`
    );
  });

  const alertMatches = thresholds.length
    ? sortedItems.filter((item) => thresholds.some((threshold) => item.discountPercent >= threshold))
    : [];

  if (alertMatches.length) {
    console.log(`\nALERT: ${alertMatches.length} items met discount thresholds (${thresholds.join(', ')}%).`);
    alertMatches.forEach((item) => {
      console.log(
        `ALERT ITEM: ${item.title} | ${item.discountPercent.toFixed(1)}% off | ${item.link ?? 'no link'}`
      );
    });

    const webhookUrl = optionalEnv('ALERT_WEBHOOK_URL');
    if (webhookUrl) {
      await sendWebhook(webhookUrl, {
        timestamp: new Date().toISOString(),
        thresholds,
        matchCount: alertMatches.length,
        matches: alertMatches.map((item) => ({
          id: item.id,
          title: item.title,
          brand: item.brand,
          discountPercent: Number(item.discountPercent.toFixed(1)),
          price: item.price,
          salePrice: item.salePrice,
          link: item.link,
          imageLink: item.imageLink,
        })),
      });
      console.log('Alert webhook delivered.');
    }
  } else {
    console.log('\nNo items met discount thresholds.');
  }
};

main().catch((error) => {
  console.error(`\nError: ${error.message}`);
  process.exit(1);
});