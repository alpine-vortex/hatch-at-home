// A tiny static server for the card bench: the repo root, plus the card's own
// /virtual_pet/frontend/ URL mapped to the integration's frontend folder (the
// card builds every sprite and font URL from that base). Localhost only.

const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const FRONTEND = path.join(ROOT, "custom_components", "virtual_pet", "frontend");
const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".json": "application/json", ".png": "image/png", ".woff2": "font/woff2",
  ".css": "text/css", ".svg": "image/svg+xml",
};

function resolve(url) {
  let rel = decodeURIComponent(url.split("?")[0]);
  if (rel === "/") rel = "/dev/bench/index.html";
  const base = rel.startsWith("/virtual_pet/frontend/") ? FRONTEND : ROOT;
  if (base === FRONTEND) rel = rel.slice("/virtual_pet/frontend".length);
  const file = path.normalize(path.join(base, rel));
  return file.startsWith(base) ? file : null; // no walking out of the repo
}

// Resolves to { server, url }; port 0 picks a free one.
function startServer(port = 0) {
  const server = http.createServer((req, res) => {
    const file = resolve(req.url);
    fs.readFile(file || "", (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end("not found");
        return;
      }
      res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream", "Cache-Control": "max-age=300" });
      res.end(data);
    });
  });
  return new Promise((ok) => server.listen(port, "127.0.0.1", () =>
    ok({ server, url: `http://127.0.0.1:${server.address().port}` })));
}

module.exports = { startServer };

if (require.main === module) {
  startServer(Number(process.env.PORT || 8765)).then(({ url }) => console.log(`card bench at ${url}/`));
}
