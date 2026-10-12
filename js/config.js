/* ============================================================
   ContractCraft — site configuration
   ------------------------------------------------------------
   OWNER TO-DO: paste your Stripe Payment Links below.
   1. In Stripe Dashboard -> Payment Links, create two links:
      - "ContractCraft Single Unlock"   price HK$148.00 (one-time)
      - "ContractCraft Bundle Unlock"   price HK$228.00 (one-time)
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
  stripePaymentLinkSingle: "https://buy.stripe.com/dRmDR95oE0Magrd2cU7Vm04",
  stripePaymentLinkBundle: "https://buy.stripe.com/bJedR97wM9iG2An3gY7Vm05",
  priceSingle: "HK$148",
  priceBundle: "HK$228",
  /* Optional extras (safe to leave as-is; update at launch): */
  siteUrl: "https://patrickltl.github.io/contractcraft",
  supportEmail: "patrickltl@hotmail.com"
};
