const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const root = __dirname;
const publicRoot = path.join(root, "public");
const legacyModules = new Set([
  "app.js",
  "auth.js",
  "booking.js",
  "calendar.js",
  "products.js",
  "supabase-client.js",
]);
const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
};

loadEnvironment(path.join(root, ".env"));

const server = http.createServer((request, response) => {
  setSecurityHeaders(response);
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.setHeader("Allow", "GET, HEAD");
    return send(response, 405, "Method not allowed.");
  }

  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
  } catch {
    return send(response, 400, "Invalid URL.");
  }

  if (pathname === "/healthz") {
    response.setHeader("Content-Type", "application/json; charset=utf-8");
    response.end(request.method === "HEAD" ? undefined : JSON.stringify({ status: "ok" }));
    return;
  }
  if (pathname === "/outputs/supabase-config.js") {
    return sendRuntimeConfig(request, response);
  }

  let filePath;
  if (pathname.startsWith("/outputs/")) {
    const moduleName = pathname.slice("/outputs/".length);
    if (!legacyModules.has(moduleName)) return send(response, 404, "Not found.");
    filePath = path.join(root, "outputs", moduleName);
  } else {
    const relativePath = pathname === "/" ? "index.html" : pathname.slice(1);
    if (!["index.html", "styles.css", "app.js"].includes(relativePath)) {
      return send(response, 404, "Not found.");
    }
    filePath = path.join(publicRoot, relativePath);
  }

  fs.readFile(filePath, (error, contents) => {
    if (error) {
      if (error.code === "ENOENT") return send(response, 404, "Not found.");
      console.error("Failed to read site asset:", error.message);
      return send(response, 500, "Unable to serve the requested file.");
    }
    response.setHeader("Content-Type", mimeTypes[path.extname(filePath)] || "application/octet-stream");
    response.setHeader("Cache-Control", "no-cache");
    response.end(request.method === "HEAD" ? undefined : contents);
  });
});

const port = Number(process.env.PORT || 0);
server.on("error", (error) => {
  console.error("HTTP server failed to start:", error.message);
  process.exitCode = 1;
});
server.listen(port, "0.0.0.0", () => {
  const address = server.address();
  console.log(`Barbearias listening on http://0.0.0.0:${address.port}`);
});

function sendRuntimeConfig(request, response) {
  const { SUPABASE_URL = "", SUPABASE_PUBLISHABLE_KEY = "", BARBERSHOP_SLUG = "vintage-house" } = process.env;
  if (SUPABASE_URL) {
    let parsedUrl;
    try {
      parsedUrl = new URL(SUPABASE_URL);
    } catch {
      return send(response, 500, "SUPABASE_URL must be a valid HTTPS URL.");
    }
    if (parsedUrl.protocol !== "https:") {
      return send(response, 500, "SUPABASE_URL must use HTTPS.");
    }
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(BARBERSHOP_SLUG)) {
    return send(response, 500, "BARBERSHOP_SLUG has an invalid format.");
  }

  const source = [
    `export const SUPABASE_URL = ${JSON.stringify(SUPABASE_URL || "https://YOUR-PROJECT.supabase.co")};`,
    `export const SUPABASE_PUBLISHABLE_KEY = ${JSON.stringify(SUPABASE_PUBLISHABLE_KEY || "YOUR_SUPABASE_PUBLISHABLE_KEY")};`,
    `const configuredSlug = ${JSON.stringify(BARBERSHOP_SLUG)};`,
    "export const BARBERSHOP_SLUG = new URLSearchParams(window.location.search).get(\"shop\") || configuredSlug;",
  ].join("\n");
  response.setHeader("Content-Type", "text/javascript; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(request.method === "HEAD" ? undefined : source);
}

function send(response, status, message) {
  response.statusCode = status;
  response.setHeader("Content-Type", "text/plain; charset=utf-8");
  response.end(message);
}

function setSecurityHeaders(response) {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
}

function loadEnvironment(envPath) {
  if (!fs.existsSync(envPath)) return;
  const text = fs.readFileSync(envPath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([\w.-]+)\s*=\s*(.*?)\s*$/);
    if (!match || Object.hasOwn(process.env, match[1])) continue;
    let value = match[2];
    if ((value.startsWith("\"") && value.endsWith("\""))
      || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    } else {
      value = value.replace(/\s+#.*$/, "");
    }
    process.env[match[1]] = value;
  }
}
