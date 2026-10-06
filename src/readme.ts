import { marked } from "marked";
import { page } from "./html.js";

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
