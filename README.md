# Commons

A simple chat app: plain HTML, CSS and JavaScript in the browser, plus a small Node.js server.

## Version 2 (current)
- One shared room: everyone with the link sees the same messages
- Messages are kept on the server and saved to `messages.json`
- No packages to install; the server uses only Node.js built-ins (Node 18 or newer)

## Run
    node server.js

Then open http://localhost:8080 (set another port with `PORT=3000 node server.js`).

## Update on the server
    pkill -f "node server.js"
    git pull
    setsid nohup node server.js > server.log 2>&1 &

## Planned upgrades
- WebSockets for instant delivery
- Multiple rooms
- Logins
- A database instead of messages.json
