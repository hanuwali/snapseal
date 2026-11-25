// Stripe calls this after a payment. This (not the redirect page) is the proof an order was paid.
import Stripe from "stripe";
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
export const config = { api: { bodyParser: false } };

const raw = (req) => new Promise((ok, no) => { const c = []; req.on("data", d => c.push(d)); req.on("end", () => ok(Buffer.concat(c))); req.on("error", no); });

export default async function handler(req, res) {
  let event;
  try {
    event = stripe.webhooks.constructEvent(await raw(req), req.headers["stripe-signature"], process.env.STRIPE_WEBHOOK_SECRET);
  } catch (e) { return res.status(400).send("Bad signature"); }

  if (event.type === "checkout.session.completed" && event.data.object.payment_status === "paid") {
    const s = await stripe.checkout.sessions.retrieve(event.data.object.id,
      { expand: ["line_items.data.price.product"] });
    const order = { id: s.id, email: s.customer_details?.email, ship_to: s.collected_information?.shipping_details ?? s.shipping_details,
      total: s.amount_total, items: s.line_items.data.map(l => ({ qty: l.quantity, name: l.description, ...l.price.product.metadata })) };
    console.log("PAID ORDER", JSON.stringify(order)); // TODO: replace with your fulfilment (email yourself, Google Sheet, shipping label)
  }
  res.status(200).json({ received: true });
}
