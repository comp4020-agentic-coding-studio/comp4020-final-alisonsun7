import { marked } from "marked";

// Full server-rendered HTML shell shared by the home page and /readme/, kept
// inline (no template engine) since the app has two pages so far.
const page = (title: string, body: string): string => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title}</title>
</head>
<body>
${body}
</body>
</html>
`;

export const homePage = page(
  "DayDraw",
  `<main>
<h1>DayDraw</h1>
<p>Plan a day together.</p>
<p>Split the thinking. Share the ideas.</p>
<p>Designed for groups of up to 12. Start with 2.</p>
<p>A room divides ideas into <strong>WHERE</strong>, <strong>EAT</strong> and <strong>DO</strong> — a drawn card suggests which to focus on, it does not restrict what you can see or add.</p>
<p>Create and join are being built next; this deploy proves the app and its home page are live.</p>
<p><a href="/readme/">Read our approach</a></p>
</main>`,
);

export function renderReadmePage(markdown: string): string {
  const body = marked.parse(markdown, { async: false }) as string;
  return page(
    "DayDraw — README",
    `<nav><a href="/">&larr; Back to DayDraw</a></nav>
<main>
${body}
</main>`,
  );
}
