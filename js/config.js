/* ============================================================
   ContractCraft — site configuration
   ------------------------------------------------------------
   OWNER TO-DO: paste your Stripe Payment Links below.
   1. In Stripe Dashboard -> Payment Links, create two links:
      - "ContractCraft Single Unlock"   price $19.00 (one-time)
      - "ContractCraft Bundle Unlock"   price $29.00 (one-time)
   2. In Stripe's "After payment" settings choose
      "Don't show confirmation page" -> custom URL, OR better:
      set the success URL to:
         https://YOURDOMAIN/unlocked.html  (or /?unlocked=1)
      and tell buyers their license key is delivered by email
      (see README.md "Stripe link setup + license delivery").
   3. Paste the full https://buy.stripe.com/... URLs below.
   Until then, the buy buttons will show a friendly
   "checkout not configured" notice instead of failing silently.
   ============================================================ */
const SITE_CONFIG = {
  brandName: "ContractCraft",
  stripePaymentLinkSingle: "PASTE_STRIPE_LINK",
  stripePaymentLinkBundle: "PASTE_STRIPE_LINK",
  priceSingle: "$19",
  priceBundle: "$29",
  /* Optional extras (safe to leave as-is; update at launch): */
  siteUrl: "https://patrickltl.github.io/contractcraft",
  supportEmail: "patrickltl@hotmail.com"
};
