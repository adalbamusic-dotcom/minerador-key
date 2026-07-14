import { Extension, Mark, Node, mergeAttributes } from "@tiptap/core";

export const BlockIdentity = Extension.create({
  name: "blockIdentity",
  addGlobalAttributes() { return [{ types: ["heading", "paragraph", "bulletList", "orderedList", "blockquote", "table", "editorialBlock"], attributes: {
    blockId: { default: null, parseHTML: element => element.getAttribute("data-block-id"), renderHTML: attributes => attributes.blockId ? { "data-block-id": attributes.blockId } : {} },
  } }]; },
});

export const EditorialBlock = Node.create({
  name: "editorialBlock", group: "block", atom: true, selectable: true, draggable: true,
  addAttributes() { return { kind: { default: "note" }, label: { default: "Bloco editorial" }, data: { default: "{}" } }; },
  parseHTML() { return [{ tag: "div[data-editorial-block]", getAttrs: element => ({ kind: (element as HTMLElement).dataset.kind, label: (element as HTMLElement).dataset.label, data: (element as HTMLElement).dataset.payload }) }]; },
  renderHTML({ HTMLAttributes }) { return ["div", mergeAttributes(HTMLAttributes, { "data-editorial-block": "true", "data-kind": HTMLAttributes.kind, "data-label": HTMLAttributes.label, "data-payload": HTMLAttributes.data, class: "editorial-special-block", contenteditable: "false" }), ["strong", {}, HTMLAttributes.label || "Bloco editorial"]]; },
});

export const EditorialComment = Mark.create({
  name: "editorialComment", inclusive: false,
  addAttributes() { return { commentId: { default: null }, body: { default: "" } }; },
  parseHTML() { return [{ tag: "span[data-editorial-comment]" }]; },
  renderHTML({ HTMLAttributes }) { return ["span", mergeAttributes(HTMLAttributes, { "data-editorial-comment": HTMLAttributes.commentId, title: HTMLAttributes.body, class: "editorial-comment" }), 0]; },
});

