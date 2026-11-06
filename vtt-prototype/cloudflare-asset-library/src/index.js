const STORAGE_LIMIT_BYTES = 5 * 1024 * 1024 * 1024;
const MAX_ITEM_BYTES = 8 * 1024 * 1024;
const TOKEN_LIFETIME_SECONDS = 30 * 24 * 60 * 60;
const ITEM_PREFIX = "items/";
const encoder = new TextEncoder();

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...headers }
  });
}

function corsHeaders(origin, env) {
  const allowed = env.ALLOWED_ORIGIN || "https://archqwynn.github.io";
  if (origin && origin !== allowed) return null;
  return {
    "access-control-allow-origin": allowed,
    "access-control-allow-methods": "GET, POST, PUT, DELETE, OPTIONS",
    "access-control-allow-headers": "Authorization, Content-Type",
    "access-control-max-age": "86400",
    "vary": "Origin"
  };
}

function toBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized + "=".repeat((4 - normalized.length % 4) % 4));
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

async function signingKey(env) {
  if (!env.ASSET_LIBRARY_ACCESS_KEY || env.ASSET_LIBRARY_ACCESS_KEY.length < 24) {
    throw new Error("The ASSET_LIBRARY_ACCESS_KEY secret is not configured or is too short.");
  }
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(env.ASSET_LIBRARY_ACCESS_KEY),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

async function issueToken(env) {
  const now = Math.floor(Date.now() / 1000);
  const payload = toBase64Url(encoder.encode(JSON.stringify({
    sub: "asset-library-gm",
    iat: now,
    exp: now + TOKEN_LIFETIME_SECONDS
  })));
  const message = "woa1." + payload;
  const signature = await crypto.subtle.sign("HMAC", await signingKey(env), encoder.encode(message));
  return message + "." + toBase64Url(new Uint8Array(signature));
}

async function isAuthorized(request, env) {
  const header = request.headers.get("authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return false;
  const parts = match[1].split(".");
  if (parts.length !== 3 || parts[0] !== "woa1") return false;
  try {
    const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(parts[1])));
    if (payload.sub !== "asset-library-gm" || !Number.isFinite(payload.exp) || payload.exp <= Math.floor(Date.now() / 1000)) return false;
    return await crypto.subtle.verify(
      "HMAC",
      await signingKey(env),
      fromBase64Url(parts[2]),
      encoder.encode(parts[0] + "." + parts[1])
    );
  } catch {
    return false;
  }
}

async function passwordMatches(candidate, env) {
  if (typeof candidate !== "string" || !env.ASSET_LIBRARY_ACCESS_KEY) return false;
  const [candidateHash, secretHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(candidate)),
    crypto.subtle.digest("SHA-256", encoder.encode(env.ASSET_LIBRARY_ACCESS_KEY))
  ]);
  const a = new Uint8Array(candidateHash);
  const b = new Uint8Array(secretHash);
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a[i] ^ b[i];
  return difference === 0;
}

function validId(id) {
  return typeof id === "string" && /^library-[a-z0-9-]{1,100}$/i.test(id);
}

async function listAllItems(bucket) {
  const items = [];
  let usedBytes = 0;
  let cursor;
  do {
    const page = await bucket.list({
      prefix: ITEM_PREFIX,
      limit: 1000,
      cursor,
      include: ["customMetadata"]
    });
    for (const object of page.objects) {
      usedBytes += object.size || 0;
      const metadata = object.customMetadata || {};
      items.push({
        id: object.key.slice(ITEM_PREFIX.length),
        kind: metadata.kind === "token" ? "token" : "asset",
        name: metadata.name || "Unnamed item",
        updatedAt: metadata.updatedAt || object.uploaded?.toISOString?.() || "",
        size: object.size || 0
      });
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  items.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  return { items, usedBytes };
}

async function handleApi(request, env, url) {
  if (request.method === "GET" && url.pathname === "/api/health") {
    return json({ ok: true, provider: "Cloudflare R2", limitBytes: STORAGE_LIMIT_BYTES });
  }

  if (request.method === "POST" && url.pathname === "/api/login") {
    let body;
    try { body = await request.json(); } catch { return json({ error: "Invalid login request." }, 400); }
    if (!await passwordMatches(body?.password, env)) {
      return json({ error: "The Asset Library access key is incorrect." }, 401);
    }
    return json({
      token: await issueToken(env),
      expiresIn: TOKEN_LIFETIME_SECONDS,
      limitBytes: STORAGE_LIMIT_BYTES
    });
  }

  if (!await isAuthorized(request, env)) {
    return json({ error: "GM authentication required. Connect to the Cloud Asset Library again." }, 401);
  }
  if (!env.ASSET_LIBRARY) {
    return json({ error: "The R2 bucket binding is missing. Check the Worker configuration." }, 503);
  }

  if (request.method === "GET" && url.pathname === "/api/items") {
    const result = await listAllItems(env.ASSET_LIBRARY);
    return json({ ...result, limitBytes: STORAGE_LIMIT_BYTES });
  }

  const match = url.pathname.match(/^\/api\/items\/([^/]+)$/);
  if (!match) return json({ error: "API route not found." }, 404);
  const id = decodeURIComponent(match[1]);
  if (!validId(id)) return json({ error: "Invalid Asset Library item ID." }, 400);
  const key = ITEM_PREFIX + id;

  if (request.method === "GET") {
    const object = await env.ASSET_LIBRARY.get(key);
    if (!object) return json({ error: "This library item no longer exists." }, 404);
    return new Response(object.body, {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "private, no-store",
        "etag": object.httpEtag
      }
    });
  }

  if (request.method === "PUT") {
    const declaredLength = Number(request.headers.get("content-length") || 0);
    if (declaredLength > MAX_ITEM_BYTES) return json({ error: "This library item is larger than the 8 MB per-item limit." }, 413);
    const raw = await request.text();
    const bytes = encoder.encode(raw).byteLength;
    if (!bytes || bytes > MAX_ITEM_BYTES) return json({ error: "This library item is empty or larger than the 8 MB per-item limit." }, 413);

    let item;
    try { item = JSON.parse(raw); } catch { return json({ error: "The library item is not valid JSON." }, 400); }
    if (
      item?.format !== "wings-of-atreia-vtt-asset-library-item" ||
      item.id !== id ||
      !["token", "asset"].includes(item.kind) ||
      !item.payload || typeof item.payload !== "object"
    ) {
      return json({ error: "The library item format is invalid." }, 400);
    }

    const existing = await env.ASSET_LIBRARY.head(key);
    const { usedBytes } = await listAllItems(env.ASSET_LIBRARY);
    const projectedBytes = usedBytes - (existing?.size || 0) + bytes;
    if (projectedBytes > STORAGE_LIMIT_BYTES) {
      return json({
        error: "The shared Asset Library has reached its 5 GB storage limit. Delete an item before uploading more.",
        usedBytes,
        limitBytes: STORAGE_LIMIT_BYTES
      }, 413);
    }

    await env.ASSET_LIBRARY.put(key, raw, {
      httpMetadata: { contentType: "application/json; charset=utf-8" },
      customMetadata: {
        kind: item.kind,
        name: String(item.name || "Unnamed item").slice(0, 120),
        updatedAt: String(item.updatedAt || new Date().toISOString())
      }
    });
    return json({ ok: true, size: bytes, usedBytes: projectedBytes, limitBytes: STORAGE_LIMIT_BYTES });
  }

  if (request.method === "DELETE") {
    await env.ASSET_LIBRARY.delete(key);
    const { usedBytes } = await listAllItems(env.ASSET_LIBRARY);
    return json({ ok: true, usedBytes, limitBytes: STORAGE_LIMIT_BYTES });
  }

  return json({ error: "Method not allowed." }, 405, { allow: "GET, PUT, DELETE" });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("origin");
    const cors = corsHeaders(origin, env);
    if (!cors) return json({ error: "This website is not allowed to access the Asset Library API." }, 403);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

    try {
      const response = await handleApi(request, env, url);
      const headers = new Headers(response.headers);
      for (const [key, value] of Object.entries(cors)) headers.set(key, value);
      headers.set("cache-control", "no-store");
      return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
    } catch (error) {
      return json({ error: error?.message || "The Asset Library service encountered an error." }, 500, cors);
    }
  }
};
