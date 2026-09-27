/* Where the product lives. The Laravel app serves sign-in and sign-up; the
   demo link is a calendar URL when one is configured, else the site's form.
   A plain module, so server pages and client chrome can both import it. */
export const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:8080").replace(/\/$/, "");
export const DEMO_URL = process.env.NEXT_PUBLIC_CALENDAR_URL || "/start";
export const demoLinkProps = DEMO_URL.startsWith("http") ? { target: "_blank", rel: "noopener noreferrer" } : {};
