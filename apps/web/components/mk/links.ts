/* Where the product lives. A plain module, so server pages and client chrome
   can both import it.

   NEXT_PUBLIC_APP_URL is the Laravel app (Veyra Desk and Studio); without it
   the site uses the production app on Render, so sign-up never lands on the
   retired Next.js pages. It never falls back to localhost. */

const PRODUCTION_APP = "https://veyra-app-pe50.onrender.com";
const APP = (process.env.NEXT_PUBLIC_APP_URL || PRODUCTION_APP).replace(/\/$/, "");
const LEGACY_API = (process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000").replace(/\/$/, "");

export const SIGN_IN_URL = APP ? `${APP}/login` : "/login";
export const SIGN_UP_URL = APP ? `${APP}/register` : "/signup";

/** Where the contact and demo forms post, and which request shape it takes. */
export const INQUIRY_ENDPOINT = APP
  ? { url: `${APP}/api/site/inquiries`, legacy: false }
  : { url: `${LEGACY_API}/api/desk/leads/intake`, legacy: true };

/** Every "Request a demo" / "Talk to our team": the team's booking calendar. */
export const DEMO_URL = process.env.NEXT_PUBLIC_CALENDAR_URL || "https://calendar.app.google/M8BM1DXEbfKYZqyK6";
export const demoLinkProps = DEMO_URL.startsWith("http") ? { target: "_blank", rel: "noopener noreferrer" } : {};
