// Commons – simple chat, version 1
// Everything runs in the browser. Messages are saved in localStorage.
// Next upgrade: replace sendMessage() / the echo bot with a real server (WebSockets).

const MESSAGES_KEY = "commons.messages";
const NAME_KEY = "commons.username";

const listEl = document.getElementById("messages");
const emptyEl = document.getElementById("empty");
const composer = document.getElementById("composer");
const textInput = document.getElementById("text");
const renameBtn = document.getElementById("rename-btn");
const clearBtn = document.getElementById("clear-btn");
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
    /* ignore: chat still works, it just won't persist */
  }
}

/* ---------- State ---------- */

let username = readStorage(NAME_KEY, "");
let messages = readStorage(MESSAGES_KEY, []);

/* ---------- Rendering ---------- */

function formatTime(timestamp) {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function buildMessage(msg) {
  const wrapper = document.createElement("article");
  wrapper.className = "msg" + (msg.own ? " own" : "");

  const meta = document.createElement("p");
  meta.className = "meta";
  // textContent (not innerHTML) so nobody can inject HTML into the page
  meta.textContent = msg.own
    ? formatTime(msg.time)
    : `${msg.author} · ${formatTime(msg.time)}`;

  const bubble = document.createElement("p");
  bubble.className = "bubble";
  bubble.textContent = msg.text;

  wrapper.append(meta, bubble);
  return wrapper;
}

function scrollToBottom() {
  listEl.scrollTop = listEl.scrollHeight;
}

function renderAll() {
  listEl.querySelectorAll(".msg").forEach((el) => el.remove());
  messages.forEach((msg) => listEl.append(buildMessage(msg)));
  emptyEl.hidden = messages.length > 0;
  scrollToBottom();
}

function addMessage(msg) {
  messages.push(msg);
  writeStorage(MESSAGES_KEY, messages);
  emptyEl.hidden = true;
  listEl.append(buildMessage(msg));
  scrollToBottom();
}

/* ---------- Sending ---------- */

function sendMessage(text) {
  addMessage({
    author: username,
    text,
    time: Date.now(),
    own: true,
  });

  // Placeholder "other person" so you can see both sides of a conversation.
  // Delete this once a real server is connected.
  setTimeout(() => {
    addMessage({
      author: "Echo",
      text: `You said: ${text}`,
      time: Date.now(),
      own: false,
    });
  }, 600);
}

composer.addEventListener("submit", (event) => {
  event.preventDefault();
  const text = textInput.value.trim();
  if (!text) return;
  sendMessage(text);
  textInput.value = "";
  textInput.focus();
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

/* ---------- Clear chat ---------- */

clearBtn.addEventListener("click", () => {
  if (!messages.length) return;
  if (confirm("Delete all messages on this device?")) {
    messages = [];
    writeStorage(MESSAGES_KEY, messages);
    renderAll();
  }
});

/* ---------- Start ---------- */

renderAll();
if (!username) askForName();
