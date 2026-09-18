// Commons v2 – chat server
// Uses only Node.js built-in modules, so there is nothing to install.
//
// How it works:
//   GET  /api/messages?after=ID            -> messages newer than ID, right away
//   GET  /api/messages?after=ID&wait=1     -> waits (up to 25s) until a newer message arrives
//   POST /api/messages                     -> add a message
// Messages are kept in memory and saved to messages.json so they survive restarts.

const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.env.PORT) || 8080;
const HOST = "0.0.0.0";
const DATA_FILE = path.join(__dirname, "messages.json");

const MAX_HISTORY = 200; // messages kept
const MAX_TEXT = 500; // characters per message
const MAX_NAME = 24; // characters per name
const MAX_BODY_BYTES = 4096; // largest request body accepted
const WAIT_MS = 25000; // how long a "wait" request is held open

// Only these files are ever served, so server.js and messages.json stay private.
const STATIC_FILES = {
  "/": "index.html",
  "/index.html": "index.html",
  "/style.css": "style.css",
  "/script.js": "script.js",
};

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
};

/* ---------- Message store ---------- */

let messages = [];
try {
  const saved = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  if (Array.isArray(saved)) messages = saved.slice(-MAX_HISTORY);
} catch {
  // no saved file yet, start empty
}

let nextId = messages.length ? messages[messages.length - 1].id + 1 : 1;

let saveTimer = null;
function saveSoon() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    fs.writeFile(DATA_FILE, JSON.stringify(messages), (err) => {
      if (err) console.error("Could not save messages:", err.message);
    });
  }, 300);
}

function latestId() {
  return messages.length ? messages[messages.length - 1].id : 0;
}

function newerThan(id) {
  return messages.filter((m) => m.id > id);
}

/* ---------- Waiting requests ---------- */

const waiters = new Set();

function releaseWaiter(waiter) {
  if (!waiters.delete(waiter)) return;
  clearTimeout(waiter.timer);
  sendJson(waiter.res, 200, {
    messages: newerThan(waiter.after),
    latest: latestId(),
  });
}

function wakeAllWaiters() {
  for (const waiter of [...waiters]) releaseWaiter(waiter);
}

/* ---------- Helpers ---------- */

function sendJson(res, status, body) {
  if (res.writableEnded) return;
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error("too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function serveStatic(res, fileName) {
  fs.readFile(path.join(__dirname, fileName), (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }
    res.writeHead(200, {
      "Content-Type": CONTENT_TYPES[path.extname(fileName)] || "text/plain",
      "Cache-Control": "no-cache",
      "X-Content-Type-Options": "nosniff",
    });
    res.end(data);
  });
}

/* ---------- API ---------- */

function handleGetMessages(req, res, url) {
  const after = parseInt(url.searchParams.get("after") || "0", 10) || 0;
  const wait = url.searchParams.get("wait") === "1";
  const latest = latestId();

  // Answer right away unless the caller is fully caught up and asked to wait.
  if (!wait || latest !== after) {
    sendJson(res, 200, { messages: newerThan(after), latest });
    return;
  }

  const waiter = { res, after, timer: null };
  waiter.timer = setTimeout(() => releaseWaiter(waiter), WAIT_MS);
  waiters.add(waiter);
  res.on("close", () => {
    clearTimeout(waiter.timer);
    waiters.delete(waiter);
  });
}

async function handlePostMessage(req, res) {
  let data;
  try {
    data = JSON.parse(await readBody(req));
  } catch {
    sendJson(res, 400, { error: "Invalid request." });
    return;
  }

  const author = String(data.author || "").trim().slice(0, MAX_NAME);
  const text = String(data.text || "").trim();
  const senderId = String(data.senderId || "").slice(0, 64);

  if (!author || !senderId) {
    sendJson(res, 400, { error: "A name is required." });
    return;
  }
  if (!text || text.length > MAX_TEXT) {
    sendJson(res, 400, { error: `Messages must be 1 to ${MAX_TEXT} characters.` });
    return;
  }

  const message = { id: nextId++, author, senderId, text, time: Date.now() };
  messages.push(message);
  if (messages.length > MAX_HISTORY) messages = messages.slice(-MAX_HISTORY);
  saveSoon();
  wakeAllWaiters();

  sendJson(res, 201, { id: message.id });
}

/* ---------- Server ---------- */

const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");

  if (url.pathname === "/api/messages") {
    if (req.method === "GET") return handleGetMessages(req, res, url);
    if (req.method === "POST") return handlePostMessage(req, res);
    return sendJson(res, 405, { error: "Method not allowed." });
  }

  if ((req.method === "GET" || req.method === "HEAD") && STATIC_FILES[url.pathname]) {
    return serveStatic(res, STATIC_FILES[url.pathname]);
  }

  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("Not found");
});

server.listen(PORT, HOST, () => {
  console.log(`Commons is running on port ${PORT}`);
});
