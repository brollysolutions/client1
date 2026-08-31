import { createServer } from "node:http";

const HOST = "127.0.0.1";
const PORT = 4311;
const UPDATED_AT = "2026-08-30T00:00:00Z";

const PRODUCT_ROWS = [
  ["10000000-0000-4000-8000-000000000001", "personal-loan", "Personal Loan", "loan"],
  ["10000000-0000-4000-8000-000000000002", "business-loan", "Business Loan", "loan"],
  ["10000000-0000-4000-8000-000000000003", "home-loan", "Home Loan", "loan"],
  ["10000000-0000-4000-8000-000000000004", "credit-card", "Credit Card", "credit_card"],
  ["10000000-0000-4000-8000-000000000005", "health-insurance", "Health Insurance", "insurance"],
  ["10000000-0000-4000-8000-000000000006", "travel-insurance", "Travel Insurance", "insurance"],
];

const products = PRODUCT_ROWS.map(([id, slug, label, category]) => ({
  id,
  slug,
  label,
  category,
  summary: `${label} with guided Dhanadhara support.`,
  description: `Review ${label.toLowerCase()} options and continue inside Dhanadhara.`,
  highlights: ["Internal assisted journey", "Provider options in one place"],
  eligibility: ["Eligibility and approval are assessed by the selected provider"],
  documents: ["Documents are requested only during the secure application journey"],
  faq: [{ question: "Is approval guaranteed?", answer: "No. The provider makes the decision." }],
  homepage_featured: slug === "personal-loan",
  provider_count: slug === "personal-loan" ? 1 : 0,
  updated_at: UPDATED_AT,
}));

const providerOffer = {
  id: "20000000-0000-4000-8000-000000000001",
  offer_name: "Release Bank Personal Loan",
  summary: "A deterministic production-build browser fixture.",
  min_amount: null,
  max_amount: null,
  min_interest_rate: null,
  max_interest_rate: null,
  min_tenure_months: null,
  max_tenure_months: null,
  processing_fee_text: "Provider assessed",
  eligibility_summary: "Subject to provider review",
  last_verified_at: UPDATED_AT,
  provider: {
    id: "30000000-0000-4000-8000-000000000001",
    name: "Release Bank",
    legal_name: "Release Bank Limited",
    provider_type: "bank",
    logo_url: null,
  },
};

function json(response, status, body) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(JSON.stringify(body));
}

function listProducts(url) {
  const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();
  const category = url.searchParams.get("category");
  const page = Math.max(Number(url.searchParams.get("page") ?? "1") || 1, 1);
  const pageSize = Math.max(Number(url.searchParams.get("page_size") ?? "12") || 12, 1);
  const filtered = products.filter(
    (product) =>
      (!category || product.category === category) &&
      (!q || `${product.label} ${product.summary} ${product.category}`.toLowerCase().includes(q)),
  );
  const offset = (page - 1) * pageSize;
  return {
    items: filtered.slice(offset, offset + pageSize),
    total: filtered.length,
    page,
    page_size: pageSize,
  };
}

const server = createServer((request, response) => {
  const url = new URL(request.url ?? "/", `http://${HOST}:${PORT}`);

  if (request.method !== "GET") {
    json(response, 405, { detail: "Method not allowed" });
    return;
  }
  if (url.pathname === "/health") {
    json(response, 200, { status: "ok" });
    return;
  }
  if (url.pathname === "/api/v1/public/banners") {
    json(response, 200, { banners: [] });
    return;
  }
  if (url.pathname === "/api/v1/public/financial-products") {
    json(response, 200, listProducts(url));
    return;
  }

  const providerMatch = url.pathname.match(
    /^\/api\/v1\/public\/financial-products\/([^/]+)\/providers$/,
  );
  if (providerMatch) {
    const slug = decodeURIComponent(providerMatch[1]);
    const items = slug === "personal-loan" ? [providerOffer] : [];
    json(response, 200, { items, total: items.length, page: 1, page_size: 9 });
    return;
  }

  const productMatch = url.pathname.match(/^\/api\/v1\/public\/financial-products\/([^/]+)$/);
  if (productMatch) {
    const product = products.find(({ slug }) => slug === decodeURIComponent(productMatch[1]));
    json(response, product ? 200 : 404, product ?? { detail: "Not found" });
    return;
  }

  json(response, 404, { detail: "Not found" });
});

server.listen(PORT, HOST, () => {
  process.stdout.write(`Release catalogue fixture listening on http://${HOST}:${PORT}\n`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
