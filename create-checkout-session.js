// Vercel serverless function: builds a Stripe-hosted Checkout Session from the cart.
import Stripe from "stripe";
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const SITE = process.env.SITE_URL;                              // e.g. https://snapseal.vercel.app (no trailing slash)
const FLAT_SHIPPING = Number(process.env.SHIPPING_FLAT_CENTS);  // REQUIRED: charge for orders under 2 sealers
const FREE_MIN = 2, MAX = 10;

// Price IDs. These are your SANDBOX ids. Live mode has different ids:
// set STRIPE_PRICES_JSON in Vercel to override them when you go live.
const PRICES = process.env.STRIPE_PRICES_JSON ? JSON.parse(process.env.STRIPE_PRICES_JSON) : {
  "1-white": "price_1UfpjLCeorG8woeYm6xbCV5Z", "1-blue": "price_1UfpjPCeorG8woeYlqc0yPGe",
  "2-white": "price_1UfpjRCeorG8woeYDAJsy8SL", "2-blue": "price_1UfpjUCeorG8woeYQ4r8C59R",
  "4-white": "price_1UfpjWCeorG8woeYBZRMawEA", "4-blue": "price_1UfpjZCeorG8woeYX0KVWxDM",
  lanyard: "price_1UfpjbCeorG8woeYZLeXlbzi" };
const UNITS = { 1: 1, 2: 2, 4: 4 };

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", SITE);
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  try {
    const { items, lanyard } = req.body || {};
    if (!Array.isArray(items) || !items.length || items.length > 20) throw new Error("bad cart");
    let units = 0;
    const line_items = items.map(({ sku, qty }) => {
      const price = PRICES[sku], bundle = String(sku).split("-")[0];
      if (!price || !UNITS[bundle] || !Number.isInteger(qty) || qty < 1 || qty > MAX) throw new Error("bad item");
      units += UNITS[bundle] * qty;
      return { price, quantity: qty };
    });
    if (lanyard) line_items.push({ price: PRICES.lanyard, quantity: 1 });
    if (!Number.isFinite(FLAT_SHIPPING)) throw new Error("SHIPPING_FLAT_CENTS not set");
    const free = units >= FREE_MIN;
    const session = await stripe.checkout.sessions.create({
      mode: "payment", line_items,
      shipping_address_collection: { allowed_countries: ["CA"] }, // add countries only if you really ship there
      shipping_options: [{ shipping_rate_data: { type: "fixed_amount", tax_behavior: "exclusive",
        fixed_amount: { amount: free ? 0 : FLAT_SHIPPING, currency: "cad" },
        display_name: free ? "Free shipping" : "Standard shipping" } }],
      automatic_tax: { enabled: process.env.STRIPE_TAX === "true" }, // only after Stripe Tax + GST/HST registration
      success_url: `${SITE}/?checkout=success`,
      cancel_url: `${SITE}/`,
    });
    res.status(200).json({ url: session.url });
  } catch (e) { console.error(e); res.status(400).json({ error: "Could not create checkout" }); }
}
