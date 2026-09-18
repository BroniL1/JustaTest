// Commons v2 – shared chat
// Messages now live on the server (server.js), so everyone with the link sees the same room.
// The browser asks the server for new messages and the server answers as soon as one arrives.

const NAME_KEY = "commons.username";
const ID_KEY = "commons.clientId";

const listEl = document.getElementById("messages");
const emptyEl = document.getElementById("empty");
const composer = document.getElementById("composer");
const textInput = document.getElementById("text");
const renameBtn = document.getElementById("rename-btn");
const statusEl = document.getElementById("status");
const statusText = document.getElementById("status-text");
const nameDialog = document.getElementById("name-dialog");
const nameForm = document.getElementById("name-form");
const nameInput = document.getElementById("name-input");

/* ---------- Storage helpers (safe if storage is blocked) ---------- */

function readStorage(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

/* ---------- Identity ---------- */

function makeId() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return "id-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

let clientId = readStorage(ID_KEY, "");
if (!clientId) {
  clientId = makeId();
  writeStorage(ID_KEY, clientId);
}

let username = readStorage(NAME_KEY, "");

/* ---------- Connection status ---------- */

let connected = false;
let statusTimer = null;

function renderStatus() {
  statusEl.dataset.state = connected ? "online" : "offline";
  statusText.textContent = connected ? "Online" : "Reconnecting";
}

function setConnected(value) {
  connected = value;
  renderStatus();
}

function flashSendError() {
  statusEl.dataset.state = "offline";
  statusText.textContent = "Message not sent";
  clearTimeout(statusTimer);
  statusTimer = setTimeout(renderStatus, 3000);
}

/* ---------- Rendering ---------- */

function formatTime(timestamp) {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function buildMessage(msg) {
  const own = msg.senderId === clientId;

  const wrapper = document.createElement("article");
  wrapper.className = "msg" + (own ? " own" : "");

  const meta = document.createElement("p");
  meta.className = "meta";
  // textContent (not innerHTML) so nobody can inject HTML into the page
  meta.textContent = own
    ? formatTime(msg.time)
    : `${msg.author} · ${formatTime(msg.time)}`;

  const bubble = document.createElement("p");
  bubble.className = "bubble";
  bubble.textContent = msg.text;

  wrapper.append(meta, bubble);
  return wrapper;
}

function isNearBottom() {
  return listEl.scrollHeight - listEl.scrollTop - listEl.clientHeight < 80;
}

function scrollToBottom() {
  listEl.scrollTop = listEl.scrollHeight;
}

function resetList() {
  listEl.querySelectorAll(".msg").forEach((el) => el.remove());
  emptyEl.hidden = false;
}

function addMessages(newMessages) {
  if (!newMessages.length) return;

  const stick = isNearBottom() || newMessages.some((m) => m.senderId === clientId);
  emptyEl.hidden = true;
  newMessages.forEach((msg) => listEl.append(buildMessage(msg)));
  if (stick) scrollToBottom();
}

/* ---------- Talking to the server ---------- */

let lastId = 0;
let firstLoad = true;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function pollLoop() {
  while (true) {
    try {
      // The first request loads history right away; later ones wait for news.
      const url = `api/messages?after=${lastId}` + (firstLoad ? "" : "&wait=1");
      const options = { cache: "no-store" };
      if (typeof AbortSignal !== "undefined" && AbortSignal.timeout) {
        options.signal = AbortSignal.timeout(40000);
      }

      const res = await fetch(url, options);
      if (!res.ok) throw new Error("Server error " + res.status);
      const data = await res.json();

      setConnected(true);

      if (data.latest < lastId) {
        // The server's history was reset, so start over.
        resetList();
        lastId = 0;
        firstLoad = true;
        continue;
      }

      const fresh = data.messages.filter((m) => m.id > lastId);
      addMessages(fresh);
      lastId = data.latest;
      if (firstLoad) {
        firstLoad = false;
        scrollToBottom();
      }
    } catch {
      setConnected(false);
      await sleep(2000);
    }
  }
}

async function sendMessage(text) {
  const res = await fetch("api/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ author: username, senderId: clientId, text }),
  });
  if (!res.ok) throw new Error("Send failed");
}

composer.addEventListener("submit", async (event) => {
  event.preventDefault();
  const text = textInput.value.trim();
  if (!text) return;

  textInput.value = "";
  textInput.focus();
  try {
    await sendMessage(text);
  } catch {
    textInput.value = text; // give the text back so it isn't lost
    flashSendError();
  }
});

/* ---------- Name dialog ---------- */

function askForName() {
  nameInput.value = username;
  nameDialog.showModal();
  nameInput.focus();
}

nameForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const name = nameInput.value.trim();
  if (!name) return;
  username = name;
  writeStorage(NAME_KEY, username);
  nameDialog.close();
  textInput.focus();
});

// Don't let Escape close the dialog before a name exists
nameDialog.addEventListener("cancel", (event) => {
  if (!username) event.preventDefault();
});

renameBtn.addEventListener("click", askForName);

/* ---------- Start ---------- */

statusEl.dataset.state = "connecting";
statusText.textContent = "Connecting";
pollLoop();
if (!username) askForName();
