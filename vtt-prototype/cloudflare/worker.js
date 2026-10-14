const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const MAX_PARTICIPANTS = 11;
const MAX_MESSAGE_CHARS = 200_000;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
  });
}

function makeCode(length = 6) {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, b => ROOM_CODE_ALPHABET[b % ROOM_CODE_ALPHABET.length]).join("");
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/health") {
      return json({ ok: true, service: "wings-of-atreia-realtime", stage: "prototype" });
    }

    if (url.pathname === "/api/rooms" && request.method === "POST") {
      let body = {};
      try { body = await request.json(); } catch { return json({ error: "Expected JSON." }, 400); }
      const roomCode = makeCode();
      const gmKey = Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, "0")).join("");
      const id = env.GAME_ROOMS.idFromName(roomCode);
      const stub = env.GAME_ROOMS.get(id);
      const init = await stub.fetch("https://room.internal/initialize", {
        method: "POST",
        headers: { "content-type": "application/json", "x-gm-key": gmKey },
        body: JSON.stringify({ title: typeof body.title === "string" ? body.title.slice(0, 80) : "Wings of Atreia Game" })
      });
      if (!init.ok) return json({ error: "Could not create room." }, 500);
      return json({ roomCode, gmKey, participantLimit: MAX_PARTICIPANTS }, 201);
    }

    const match = url.pathname.match(/^\/api\/rooms\/([A-HJ-NP-Z2-9]{6})$/);
    if (match) {
      const roomCode = match[1];
      const id = env.GAME_ROOMS.idFromName(roomCode);
      const stub = env.GAME_ROOMS.get(id);
      const headers = new Headers(request.headers);
      headers.set("x-room-code", roomCode);
      headers.set("x-room-role", url.searchParams.get("role") === "gm" ? "gm" : "player");
      headers.set("x-gm-key", url.searchParams.get("key") || "");
      const forwarded = new Request("https://room.internal/connect", request);
      const clean = new Request(forwarded, { headers });
      return stub.fetch(clean);
    }
    return json({ error: "Not found." }, 404);
  }
};

export class GameRoom {
  constructor(ctx) {
    this.ctx = ctx;
    this.sockets = new Map();
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/initialize" && request.method === "POST") {
      const existing = await this.ctx.storage.get("gmKey");
      if (existing) return new Response("Room already exists.", { status: 409 });
      const gmKey = request.headers.get("x-gm-key");
      if (!gmKey) return new Response("Missing GM key.", { status: 400 });
      const body = await request.json();
      await this.ctx.storage.put({
        gmKey,
        title: typeof body.title === "string" ? body.title : "Wings of Atreia Game",
        scene: null,
        createdAt: new Date().toISOString()
      });
      return new Response("Created.", { status: 201 });
    }

    if (url.pathname !== "/connect") return new Response("Not found.", { status: 404 });
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return new Response("WebSocket upgrade required.", { status: 426 });
    }

    const room = await this.ctx.storage.get();
    if (!room?.gmKey) return new Response("Room not found.", { status: 404 });
    const role = request.headers.get("x-room-role") === "gm" ? "gm" : "player";
    if (role === "gm" && request.headers.get("x-gm-key") !== room.gmKey) {
      return new Response("Invalid GM key.", { status: 403 });
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    server.accept();

    const currentCount = this.ctx.getWebSockets().length;
    if (currentCount >= MAX_PARTICIPANTS) {
      server.close(1013, "Room is full (maximum 11 participants).");
      return new Response(null, { status: 101, webSocket: client });
    }

    const participantId = crypto.randomUUID();
    this.sockets.set(server, { participantId, role });
    server.send(JSON.stringify({ type: "welcome", participantId, role, title: room.title, participantLimit: MAX_PARTICIPANTS, scene: room.scene }));
    this.broadcast({ type: "presence", count: this.ctx.getWebSockets().length, joined: participantId }, server);

    server.addEventListener("message", async event => {
      if (typeof event.data !== "string" || event.data.length > MAX_MESSAGE_CHARS) {
        server.close(1009, "Message too large.");
        return;
      }
      let message;
      try { message = JSON.parse(event.data); } catch { return; }
      if (!message || typeof message.type !== "string") return;

      if (message.type === "ping") {
        server.send(JSON.stringify({ type: "pong", at: Date.now() }));
        return;
      }
      if (message.type === "scene" && role === "gm") {
        const scene = message.scene;
        if (!scene || typeof scene !== "object" || JSON.stringify(scene).length > MAX_MESSAGE_CHARS) {
          server.send(JSON.stringify({ type: "error", message: "Invalid or oversized scene snapshot." }));
          return;
        }
        await this.ctx.storage.put("scene", scene);
        this.broadcast({ type: "scene", scene, from: participantId });
        return;
      }
      server.send(JSON.stringify({ type: "error", message: role === "player" ? "Player state editing is not enabled in this prototype stage." : "Unsupported message type." }));
    });

    const remove = () => {
      this.sockets.delete(server);
      this.broadcast({ type: "presence", count: this.ctx.getWebSockets().length, left: participantId });
    };
    server.addEventListener("close", remove);
    server.addEventListener("error", remove);

    return new Response(null, { status: 101, webSocket: client });
  }

  broadcast(message, except = null) {
    const payload = JSON.stringify(message);
    for (const socket of this.ctx.getWebSockets()) {
      if (socket === except) continue;
      try { socket.send(payload); } catch { try { socket.close(1011, "Broadcast failed."); } catch {} }
    }
  }
}
