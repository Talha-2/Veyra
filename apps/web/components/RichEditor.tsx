"use client";

import { forwardRef, useImperativeHandle } from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import { Table } from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableHeader from "@tiptap/extension-table-header";
import TableCell from "@tiptap/extension-table-cell";
import {
  Bold,
  Code,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Quote,
  Redo2,
  Strikethrough,
  Table as TableIcon,
  Underline as UnderlineIcon,
  Undo2,
} from "lucide-react";

export type RichEditorHandle = { getHTML: () => string; isEmpty: () => boolean };

function Btn({
  onClick,
  active,
  disabled,
  title,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className={`rich-tool ${active ? "active" : ""}`}
      onMouseDown={(e) => e.preventDefault()} // keep selection while clicking the toolbar
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      aria-pressed={active}
    >
      {children}
    </button>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  const heading = (level: 1 | 2 | 3) => () =>
    editor.chain().focus().toggleHeading({ level }).run();

  const addLink = () => {
    const prev = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("Link URL", prev ?? "https://");
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  };

  const insertTable = () =>
    editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();

  return (
    <div className="rich-toolbar">
      <Btn title="Heading 1" active={editor.isActive("heading", { level: 1 })} onClick={heading(1)}>
        <Heading1 />
      </Btn>
      <Btn title="Heading 2" active={editor.isActive("heading", { level: 2 })} onClick={heading(2)}>
        <Heading2 />
      </Btn>
      <Btn title="Heading 3" active={editor.isActive("heading", { level: 3 })} onClick={heading(3)}>
        <Heading3 />
      </Btn>
      <span className="rich-sep" />
      <Btn title="Bold" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}>
        <Bold />
      </Btn>
      <Btn title="Italic" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}>
        <Italic />
      </Btn>
      <Btn title="Underline" active={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()}>
        <UnderlineIcon />
      </Btn>
      <Btn title="Strikethrough" active={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()}>
        <Strikethrough />
      </Btn>
      <Btn title="Inline code" active={editor.isActive("code")} onClick={() => editor.chain().focus().toggleCode().run()}>
        <Code />
      </Btn>
      <span className="rich-sep" />
      <Btn title="Bullet list" active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}>
        <List />
      </Btn>
      <Btn title="Numbered list" active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
        <ListOrdered />
      </Btn>
      <Btn title="Quote" active={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()}>
        <Quote />
      </Btn>
      <span className="rich-sep" />
      <Btn title="Link" active={editor.isActive("link")} onClick={addLink}>
        <LinkIcon />
      </Btn>
      <Btn title="Insert table" onClick={insertTable}>
        <TableIcon />
      </Btn>
      <span className="rich-sep" />
      <Btn title="Undo" disabled={!editor.can().undo()} onClick={() => editor.chain().focus().undo().run()}>
        <Undo2 />
      </Btn>
      <Btn title="Redo" disabled={!editor.can().redo()} onClick={() => editor.chain().focus().redo().run()}>
        <Redo2 />
      </Btn>
    </div>
  );
}

const RichEditor = forwardRef<RichEditorHandle, { initialHTML: string; onDirty?: () => void }>(
  function RichEditor({ initialHTML, onDirty }, ref) {
    const editor = useEditor({
      immediatelyRender: false, // required with Next.js SSR
      extensions: [
        // StarterKit v3 bundles link/underline; disable so our explicit configs win
        StarterKit.configure({ link: false, underline: false } as any),
        Underline,
        Link.configure({ openOnClick: false, autolink: true }),
        Table.configure({ resizable: true }),
        TableRow,
        TableHeader,
        TableCell,
        Placeholder.configure({ placeholder: "Write your document — headings, lists, tables…" }),
      ],
      content: initialHTML || "<p></p>",
      onUpdate: () => onDirty?.(),
    });

    useImperativeHandle(
      ref,
      () => ({
        getHTML: () => editor?.getHTML() ?? "",
        isEmpty: () => editor?.isEmpty ?? true,
      }),
      [editor]
    );

    if (!editor) return <div className="skeleton h-[480px] w-full" />;

    return (
      <div>
        <Toolbar editor={editor} />
        <div className="rich-editor">
          <EditorContent editor={editor} />
        </div>
      </div>
    );
  }
);

export default RichEditor;
