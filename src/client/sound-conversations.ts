// Read the neighbours of an ordinary contribution, including removed ones.
// This view never starts, restores or moves a sound.
import type { SoundReference, SoundReplies } from "../shared/protocol.js";
import { FAMILIES, findSound } from "../shared/sounds.js";

interface Options {
  visitLabel?: string;
  load: (id: string, after?: string) => Promise<SoundReplies | null>;
  face: (sound: SoundReference) => void;
  reply: (sound: SoundReference) => void;
  canReply: (sound: SoundReference) => boolean;
  joined: () => boolean;
  open: () => void;
  close: () => void;
}

export class SoundConversations {
  readonly element = document.createElement("dialog");
  private content = document.createElement("div");
  private feedback = document.createElement("p");
  private request = 0;
  private current: SoundReplies | null = null;
  private more: HTMLButtonElement | null = null;

  constructor(private opts: Options) {
    const dialog = this.element;
    dialog.id = "sound-conversation";
    dialog.className = "sound-conversation-panel";
    dialog.hidden = true;
    dialog.setAttribute("aria-labelledby", "conversation-title");
    const head = document.createElement("div");
    head.className = "palette-head";
    const heading = document.createElement("div");
    const kicker = document.createElement("p");
    kicker.className = "library-kicker";
    kicker.textContent = "Made by people, continued by you";
    const title = document.createElement("h2");
    title.id = "conversation-title";
    title.textContent = "Sounds in conversation";
    heading.append(kicker, title);
    const close = document.createElement("button");
    close.type = "button";
    close.className = "library-close";
    close.textContent = "Close";
    close.onclick = () => this.close();
    head.append(heading, close);
    this.feedback.className = "conversation-feedback";
    this.feedback.setAttribute("role", "status");
    this.content.className = "conversation-content";
    dialog.append(head, this.feedback, this.content);
    dialog.addEventListener("close", () => {
      this.request++;
      dialog.hidden = true;
      this.opts.close();
    });
  }

  open(id: string): void {
    if (!this.element.open) {
      this.opts.open();
      this.element.hidden = false;
      this.element.showModal();
    }
    void this.load(id);
  }

  close(): void { this.element.close(); }

  changed(id?: string, parentId?: string): void {
    if (id && this.current && id !== this.current.sound.id && id !== this.current.parent?.id
      && parentId !== this.current.sound.id && !this.current.replies.some((s) => s.id === id)) return;
    if (this.element.open && this.element.dataset.id) void this.load(this.element.dataset.id);
  }

  private async load(id: string, after?: string): Promise<void> {
    const request = ++this.request;
    this.element.dataset.id = id;
    this.feedback.textContent = "Loading the conversation…";
    if (!after) this.content.replaceChildren();
    if (this.more) this.more.disabled = true;
    const result = await this.opts.load(id, after).catch(() => null);
    if (request !== this.request || !this.element.open) return;
    if (!result?.ok) {
      this.feedback.textContent = "The conversation couldn't load. Check your connection and try again.";
      const retry = document.createElement("button");
      retry.type = "button";
      retry.className = "btn ghost";
      retry.textContent = "Try again";
      retry.onclick = () => { retry.remove(); void this.load(id, after); };
      this.content.append(retry);
      if (this.more) this.more.disabled = false;
      return;
    }
    this.current = after && this.current?.sound.id === id
      ? { ...result, replies: [...this.current.replies, ...result.replies] }
      : result;
    this.render();
  }

  private render(): void {
    const current = this.current!;
    const focused = document.activeElement;
    const focusedRow = focused?.closest<HTMLElement>(".conversation-sound")?.dataset.id;
    const focusedLabel = focused instanceof HTMLButtonElement ? focused.textContent : null;
    this.content.replaceChildren();
    this.feedback.textContent = "Each sound stays where it was left. Follow a live sound, or continue the conversation.";
    if (current.parent) this.content.append(this.row(current.parent, "In reply to"));
    this.content.append(this.row(current.sound, "This contribution", true));
    if (!current.replies.length) {
      const empty = document.createElement("p");
      empty.className = "conversation-empty";
      empty.textContent = "No replies yet. Yours could be the next sound.";
      this.content.append(empty);
    }
    for (const sound of current.replies) this.content.append(this.row(sound, "Answered by"));
    this.more = null;
    if (current.nextCursor) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "btn ghost conversation-more";
      button.textContent = "Load more replies";
      button.onclick = () => void this.load(current.sound.id, current.nextCursor!);
      this.more = button;
      this.content.append(button);
    }
    if (focusedRow && focusedLabel) {
      const row = [...this.content.querySelectorAll<HTMLElement>(".conversation-sound")].find((r) => r.dataset.id === focusedRow);
      [...(row?.querySelectorAll<HTMLButtonElement>("button") ?? [])].find((b) => b.textContent === focusedLabel)?.focus();
    }
  }

  private row(sound: SoundReference, relationship: string, selected = false): HTMLElement {
    const row = document.createElement("article");
    row.className = "conversation-sound" + (selected ? " is-current" : "") + (sound.removedAt ? " is-removed" : "");
    row.dataset.id = sound.id;
    const kind = findSound(sound.soundId);
    row.style.setProperty("--family", kind ? FAMILIES[kind.family].colour : "#b9cec1");
    const relation = document.createElement("span");
    relation.className = "conversation-relation";
    relation.textContent = relationship;
    const name = document.createElement("h3");
    name.textContent = kind?.label ?? "A sound";
    const by = document.createElement("p");
    by.textContent = "Left by " + sound.by;
    row.append(relation, name, by);
    if (sound.removedAt) {
      const removed = document.createElement("p");
      removed.className = "conversation-removed";
      removed.textContent = "This contribution has been removed.";
      row.append(removed);
    }
    const actions = document.createElement("div");
    actions.className = "conversation-actions";
    if (!sound.removedAt) {
      const face = document.createElement("button");
      face.type = "button";
      face.className = "btn ghost";
      face.textContent = this.opts.visitLabel ?? "Face sound";
      face.onclick = () => { this.close(); this.opts.face(sound); };
      actions.append(face);
      const reply = document.createElement("button");
      reply.type = "button";
      reply.className = "btn primary";
      reply.textContent = this.opts.canReply(sound) ? "Reply with a sound" : "Walk closer to reply";
      reply.disabled = !this.opts.canReply(sound);
      reply.onclick = () => { this.close(); this.opts.reply(sound); };
      if (this.opts.joined()) actions.append(reply);
      else {
        const note = document.createElement("p");
        note.textContent = "Enter with a name to reply with your own sound.";
        row.append(note);
      }
    }
    if (!selected) {
      const view = document.createElement("button");
      view.type = "button";
      view.className = "btn ghost";
      view.textContent = "View conversation";
      view.onclick = () => this.open(sound.id);
      actions.append(view);
    }
    row.append(actions);
    return row;
  }
}
