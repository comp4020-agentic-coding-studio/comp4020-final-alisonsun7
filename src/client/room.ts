import { fail, startSubmit, succeed, type SubmitState } from "./submit-state.js";

const form = document.querySelector<HTMLFormElement>("#idea-form");
const status = document.querySelector<HTMLElement>("#idea-status");
const board = document.querySelector<HTMLElement>("#board");

if (form && status && board) {
  const categorySelect = form.querySelector<HTMLSelectElement>("#idea-category")!;
  const titleInput = form.querySelector<HTMLInputElement>("#idea-title")!;
  const submitButton = form.querySelector<HTMLButtonElement>("#idea-submit")!;
  const roomCode = form.dataset.roomCode!;

  let state: SubmitState = { status: "idle" };

  const render = (): void => {
    if (state.status === "saving") {
      status.textContent = "Saving…";
      submitButton.disabled = true;
    } else if (state.status === "saved") {
      status.textContent = "Saved.";
      submitButton.disabled = false;
    } else if (state.status === "error") {
      status.textContent = `${state.message} You can try again — your draft is still here.`;
      submitButton.disabled = false;
    } else {
      status.textContent = "";
      submitButton.disabled = false;
    }
  };

  const escapeHtml = (raw: string): string =>
    raw
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

  const appendToBoard = (proposal: { category: string; title: string; authorNickname: string }): void => {
    const list = board.querySelector(`[data-category="${proposal.category}"]`);
    if (!list) return;
    const item = document.createElement("li");
    item.innerHTML = `${escapeHtml(proposal.title)} <span class="author">— ${escapeHtml(proposal.authorNickname)}</span>`;
    list.appendChild(item);
  };

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const draft = { category: categorySelect.value, title: titleInput.value };

    const next = startSubmit(state, draft, () => crypto.randomUUID());
    state = next;
    render();
    if (next.status !== "saving") return; // startSubmit always returns "saving"
    const requestKey = next.requestKey;

    fetch(`/rooms/${roomCode}/proposals`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ category: draft.category, title: draft.title, requestKey }),
    })
      .then(async (res) => {
        if (res.ok) {
          const proposal = await res.json();
          state = succeed();
          render();
          appendToBoard(proposal);
          titleInput.value = "";
          return;
        }
        const body = await res.json().catch(() => ({ error: `Request failed (${res.status}).` }));
        state = fail(state, body.error ?? `Request failed (${res.status}).`);
        render();
      })
      .catch(() => {
        state = fail(state, "Could not reach the server.");
        render();
      });
  });
}
