import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { homePage, renderReadmePage } from "./readme.js";

// README.md is copied next to dist/ in the image (see Dockerfile), one level
// above this compiled file.
const __dirname = dirname(fileURLToPath(import.meta.url));
const readmePath = join(__dirname, "..", "README.md");

const port = Number(process.env.PORT ?? 8080);

const server = createServer((req, res) => {
  const url = req.url ?? "/";

  if (url === "/") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(homePage);
    return;
  }

  if (url === "/readme" || url === "/readme/") {
    const markdown = readFileSync(readmePath, "utf8");
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(renderReadmePage(markdown));
    return;
  }

  res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
  res.end("not found");
});

server.listen(port, "0.0.0.0", () => {
  console.log(`DayDraw listening on 0.0.0.0:${port}`);
});
