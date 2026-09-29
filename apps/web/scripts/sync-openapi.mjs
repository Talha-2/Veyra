// Refresh the API reference's source: copy the OpenAPI document the app serves
// into content/docs/openapi.json. Run after changing the public API:
//
//   npm run docs:sync-openapi                          (local app on :8080)
//   npm run docs:sync-openapi -- https://your-app.example
//
// The file is committed, so the docs build never depends on the app being up.

import { writeFile } from "node:fs/promises";

const base = (process.argv[2] ?? process.env.APP_URL ?? "http://127.0.0.1:8080").replace(/\/$/, "");
const url = `${base}/api/v1/openapi.json`;

const res = await fetch(url, { headers: { Accept: "application/json" } });
if (!res.ok) {
  console.error(`GET ${url} -> ${res.status}`);
  process.exit(1);
}
const spec = await res.json();
if (!spec.openapi || !spec.paths) {
  console.error(`${url} did not return an OpenAPI document`);
  process.exit(1);
}
await writeFile(new URL("../content/docs/openapi.json", import.meta.url), JSON.stringify(spec, null, 2) + "\n");
console.log(`Wrote content/docs/openapi.json: ${Object.keys(spec.paths).length} paths, ${Object.keys(spec.webhooks ?? {}).length} events (from ${url})`);
