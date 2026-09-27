/* Where the product lives. A plain module, so server pages and client chrome
   can both import it.

   NEXT_PUBLIC_APP_URL is the Laravel app (Veyra Desk and Studio). Until that
   is deployed and the variable is set, the site keeps using what already
   works on Vercel: this Next.js app's own /login and /signup, and the old
   intake endpoint for the contact form. It never falls back to localhost. */

const APP = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
const LEGACY_API = (process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000").replace(/\/$/, "");

export const SIGN_IN_URL = APP ? `${APP}/login` : "/login";
export const SIGN_UP_URL = APP ? `${APP}/register` : "/signup";

/** Where the contact and demo forms post, and which request shape it takes. */
export const INQUIRY_ENDPOINT = APP
  ? { url: `${APP}/api/site/inquiries`, legacy: false }
  : { url: `${LEGACY_API}/api/desk/leads/intake`, legacy: true };

export const DEMO_URL = process.env.NEXT_PUBLIC_CALENDAR_URL || "/start";
export const demoLinkProps = DEMO_URL.startsWith("http") ? { target: "_blank", rel: "noopener noreferrer" } : {};
