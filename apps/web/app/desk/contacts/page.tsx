"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { PageHeader, EmptyState, Spinner, Modal } from "@/components/ui";
import { Avatar, Tag, timeAgo } from "@/components/desk/kit";
import { toast } from "@/components/Toasts";
import {
  Plus,
  Filter,
  Search,
  ArrowUpDown,
  MoreVertical,
  Mail,
  Phone,
  Trash2,
  User,
  Users,
  ChevronLeft,
  ChevronRight,
  Star,
  Image as ImageIcon,
} from "lucide-react";

// ── types ──────────────────────────────────────────────────────────────────

type Contact = {
  id: string;
  name: string;
  phone: string;
  email: string;
  company: string;
  stage: string;
  source: string;
  owner: string;
  value: number;
  notes: string;
  tags: string[];
  last_contact_at: string;
  created_at: string;
};

type ContactsResponse = {
  rows: Contact[];
  total: number;
  page: number;
  per_page: number;
  pages: number;
};

type SortKey = "newest" | "name" | "activity";

// ── helpers ─────────────────────────────────────────────────────────────────

// Seed names chosen so the avatar hash lands on distinct swatch colors.
const AVATAR_SEEDS = ["Aria Blue", "Milo Vega", "Nadia Rose", "Theo Park", "Lena Sol", "Owen Frost"];

// Windowed pager: 1 … (page-1, page, page+1) … last, collapsing when it fits.
function pagerItems(page: number, pages: number): (number | "gap")[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const items: (number | "gap")[] = [1];
  const left = Math.max(2, page - 1);
  const right = Math.min(pages - 1, page + 1);
  if (left > 2) items.push("gap");
  for (let p = left; p <= right; p++) items.push(p);
  if (right < pages - 1) items.push("gap");
  items.push(pages);
  return items;
}

// ── page ────────────────────────────────────────────────────────────────────

export default function ContactsPage() {
  const [rows, setRows] = useState<Contact[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);

  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(25);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<SortKey>("newest");
  const [reloadKey, setReloadKey] = useState(0);

  const [showCreate, setShowCreate] = useState(false);

  const refetch = () => setReloadKey((k) => k + 1);

  // Single source of truth for the query: refetch (lightly debounced) whenever
  // any input to it moves. Search / sort / per_page reset page to 1 at the call
  // site, so the effect never runs against a stale window.
  useEffect(() => {
    let alive = true;
    setLoading(true);
    const timer = setTimeout(() => {
      const params = new URLSearchParams({
        page: String(page),
        per_page: String(perPage),
        sort,
      });
      if (q.trim()) params.set("q", q.trim());
      api
        .get(`/api/desk/contacts?${params.toString()}`)
        .then((d: ContactsResponse) => {
          if (!alive) return;
          setRows(d.rows ?? []);
          setTotal(d.total ?? 0);
          setPages(Math.max(1, d.pages ?? 1));
        })
        .catch((e: any) => {
          if (alive) toast.error(e?.message || "We could not load your contacts just now.");
        })
        .finally(() => {
          if (alive) setLoading(false);
        });
    }, 180);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, perPage, q, sort, reloadKey]);

  const onSearch = (v: string) => {
    setQ(v);
    setPage(1);
  };
  const onSort = (v: SortKey) => {
    setSort(v);
    setPage(1);
  };
  const onPerPage = (v: number) => {
    setPerPage(v);
    setPage(1);
  };
  const onCreated = () => {
    setPage(1);
    refetch();
  };

  const remove = async (c: Contact) => {
    if (!window.confirm(`Remove ${c.name || "this contact"}? This cannot be undone.`)) return;
    try {
      await api.del(`/api/desk/contacts/${c.id}`);
      toast.success("Contact removed");
      refetch();
    } catch (e: any) {
      toast.error(e?.message || "We could not remove this contact.");
    }
  };

  const addButton = (
    <button className="btn btn-primary btn-sm" onClick={() => setShowCreate(true)}>
      <Plus size={15} /> Add contact
    </button>
  );

  const from = total === 0 ? 0 : (page - 1) * perPage + 1;
  const to = Math.min(page * perPage, total);

  return (
    <div>
      <PageHeader
        title="Contacts"
        description="Everyone Vera has talked to, across every channel."
        actions={addButton}
      />

      {/* controls */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <button className="btn btn-secondary btn-sm">
            <Users size={14} /> List view
          </button>
          <button className="btn btn-secondary btn-sm">
            <Filter size={14} /> Filter
          </button>
          <div className="relative">
            <ArrowUpDown
              size={14}
              className="text-tertiary"
              style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}
            />
            <select
              className="input"
              value={sort}
              onChange={(e) => onSort(e.target.value as SortKey)}
              aria-label="Sort contacts"
              style={{ height: 32, width: "auto", paddingLeft: 30, paddingRight: 28, fontSize: 13 }}
            >
              <option value="newest">Newest</option>
              <option value="name">Name A to Z</option>
              <option value="activity">Last activity</option>
            </select>
          </div>
        </div>

        <div className="relative">
          <Search
            size={15}
            className="text-tertiary"
            style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}
          />
          <input
            className="input"
            placeholder="Search contacts by name, company, or number"
            value={q}
            onChange={(e) => onSearch(e.target.value)}
            style={{ height: 32, paddingLeft: 34, width: 300, fontSize: 13 }}
          />
        </div>
      </div>

      {/* body */}
      {loading ? (
        <div className="flex justify-center py-24">
          <Spinner size={20} />
        </div>
      ) : total === 0 ? (
        <div className="card">
          <EmptyState
            icon={Users}
            title="No contacts yet"
            body="Contacts appear here from calls, texts, and form submissions. Add one by hand any time."
            action={addButton}
          />
        </div>
      ) : (
        <>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th>Tags</th>
                  <th>Last Activity</th>
                  <th style={{ width: 52 }} aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => {
                  const shownTags = (c.tags ?? []).slice(0, 2);
                  const moreTags = (c.tags ?? []).length - shownTags.length;
                  return (
                    <tr key={c.id} className="crm-row">
                      <td>
                        <div className="flex items-center gap-2.5">
                          <Avatar name={c.name || "?"} size={32} />
                          <div className="min-w-0">
                            <div className="truncate font-semibold">{c.name || "Unnamed contact"}</div>
                            {c.company && (
                              <div className="text-tertiary truncate text-[12px]">{c.company}</div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td>
                        {c.email ? (
                          <span className="text-secondary truncate">{c.email}</span>
                        ) : (
                          <span className="text-tertiary">—</span>
                        )}
                      </td>
                      <td>
                        {c.phone ? (
                          <span className="mono text-[12.5px]">{c.phone}</span>
                        ) : (
                          <span className="text-tertiary">—</span>
                        )}
                      </td>
                      <td>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {shownTags.map((t, i) => (
                            <Tag key={i} label={t} />
                          ))}
                          {moreTags > 0 && (
                            <span className="text-tertiary text-[11px] font-medium">+{moreTags}</span>
                          )}
                          {shownTags.length === 0 && <span className="text-tertiary">—</span>}
                        </div>
                      </td>
                      <td>
                        <div className="flex flex-col items-start gap-1">
                          <span
                            className="badge"
                            style={{ height: 22, fontSize: 11.5, gap: 5 }}
                          >
                            <Star size={11} /> Contact created
                          </span>
                          <span
                            className="text-tertiary text-[12px]"
                            title={timeAgo(c.last_contact_at || c.created_at)}
                          >
                            {new Date(c.created_at).toLocaleDateString()}
                          </span>
                        </div>
                      </td>
                      <td>
                        <button
                          className="btn btn-ghost btn-icon btn-sm"
                          onClick={() => remove(c)}
                          aria-label={`Remove ${c.name || "contact"}`}
                          title="Remove contact"
                        >
                          <MoreVertical size={16} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* pagination */}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <select
                className="input"
                value={perPage}
                onChange={(e) => onPerPage(Number(e.target.value))}
                aria-label="Contacts per page"
                style={{ height: 32, width: "auto", paddingRight: 28, fontSize: 13 }}
              >
                <option value={15}>15 / page</option>
                <option value={25}>25 / page</option>
                <option value={50}>50 / page</option>
              </select>
              <span className="text-secondary text-[12.5px]">
                Showing {from} to {to} of {total.toLocaleString()} contacts
              </span>
            </div>

            <div className="flex items-center gap-1">
              <button
                className="btn btn-ghost btn-icon btn-sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                aria-label="Previous page"
              >
                <ChevronLeft size={16} />
              </button>

              {pagerItems(page, pages).map((item, i) =>
                item === "gap" ? (
                  <span key={`gap-${i}`} className="text-tertiary px-1 text-[13px]">
                    …
                  </span>
                ) : (
                  <button
                    key={item}
                    className={`btn btn-sm ${item === page ? "btn-primary" : "btn-ghost"}`}
                    onClick={() => setPage(item)}
                    aria-label={`Page ${item}`}
                    aria-current={item === page ? "page" : undefined}
                    style={{ minWidth: 32, padding: "0 8px" }}
                  >
                    {item}
                  </button>
                )
              )}

              <button
                className="btn btn-ghost btn-icon btn-sm"
                onClick={() => setPage((p) => Math.min(pages, p + 1))}
                disabled={page >= pages}
                aria-label="Next page"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </>
      )}

      {showCreate && (
        <CreateContactModal onClose={() => setShowCreate(false)} onCreated={onCreated} />
      )}
    </div>
  );
}

// ── create contact modal ──────────────────────────────────────────────────────

type Field = { value: string; primary: boolean };

function CreateContactModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [avatar, setAvatar] = useState(0);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [linkCompany, setLinkCompany] = useState(false);
  const [company, setCompany] = useState("");
  const [emails, setEmails] = useState<Field[]>([{ value: "", primary: true }]);
  const [phones, setPhones] = useState<Field[]>([{ value: "+1", primary: true }]);
  const [tagsInput, setTagsInput] = useState("");
  const [saving, setSaving] = useState(false);

  // shared list editors for the emails / phones repeaters
  const makeOps = (setList: React.Dispatch<React.SetStateAction<Field[]>>) => ({
    add: () => setList((list) => [...list, { value: "", primary: list.length === 0 }]),
    update: (i: number, value: string) =>
      setList((list) => list.map((f, idx) => (idx === i ? { ...f, value } : f))),
    setPrimary: (i: number) =>
      setList((list) => list.map((f, idx) => ({ ...f, primary: idx === i }))),
    remove: (i: number) =>
      setList((list) => {
        if (list.length === 1) return list;
        const next = list.filter((_, idx) => idx !== i);
        if (!next.some((f) => f.primary)) next[0] = { ...next[0], primary: true };
        return next;
      }),
  });
  const emailOps = makeOps(setEmails);
  const phoneOps = makeOps(setPhones);

  const primaryOf = (list: Field[]) => (list.find((f) => f.primary) ?? list[0])?.value.trim() ?? "";

  const save = async () => {
    const first = firstName.trim();
    const last = lastName.trim();
    const anEmail = primaryOf(emails);
    const aPhone = primaryOf(phones);
    if (!first && !last && !anEmail && !aPhone) {
      toast.error("Add a name, email, or phone to get started.");
      return;
    }
    const tags = tagsInput
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    setSaving(true);
    try {
      await api.post("/api/desk/contacts", {
        first_name: first,
        last_name: last,
        email: primaryOf(emails),
        phone: primaryOf(phones),
        company: linkCompany ? company.trim() : "",
        tags,
      });
      onClose();
      onCreated();
      toast.success("Contact created");
    } catch (e: any) {
      toast.error(e?.message || "We could not create this contact.");
      setSaving(false);
    }
  };

  const repeater = (list: Field[], ops: ReturnType<typeof makeOps>, placeholder: string, type: string) => (
    <div className="flex flex-col gap-2">
      {list.map((f, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            className="input"
            type={type}
            placeholder={placeholder}
            value={f.value}
            onChange={(e) => ops.update(i, e.target.value)}
            style={{ height: 36 }}
          />
          <button
            type="button"
            className="chip shrink-0"
            onClick={() => ops.setPrimary(i)}
            style={f.primary ? { borderColor: "var(--accent)", color: "var(--accent-text)" } : undefined}
            aria-pressed={f.primary}
          >
            <Star size={12} fill={f.primary ? "currentColor" : "none"} /> Primary
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-icon btn-sm shrink-0"
            onClick={() => ops.remove(i)}
            disabled={list.length === 1}
            aria-label="Remove"
          >
            <Trash2 size={14} />
          </button>
        </div>
      ))}
    </div>
  );

  return (
    <Modal title="Create contact" onClose={onClose} wide>
      <div className="flex flex-col gap-5">
        {/* avatar */}
        <div>
          <label className="label">Photo</label>
          <div className="flex flex-wrap items-center gap-3">
            <div
              className="flex items-center justify-center rounded-full"
              style={{ width: 40, height: 40, border: "1px dashed var(--border-strong)", color: "var(--text-tertiary)" }}
              aria-hidden
            >
              <ImageIcon size={16} />
            </div>
            <span className="hint">Or select an avatar</span>
            <div className="flex items-center gap-2">
              {AVATAR_SEEDS.map((seed, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setAvatar(i)}
                  aria-label={`Avatar ${i + 1}`}
                  aria-pressed={avatar === i}
                  className="rounded-full"
                  style={{
                    padding: 0,
                    border: "none",
                    background: "transparent",
                    cursor: "pointer",
                    borderRadius: 999,
                    boxShadow:
                      avatar === i ? "0 0 0 2px var(--surface), 0 0 0 4px var(--accent)" : "none",
                  }}
                >
                  <Avatar name={seed} size={40} />
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* name */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label flex items-center gap-1.5">
              <User size={13} className="text-tertiary" /> First name
            </label>
            <input
              className="input"
              autoFocus
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="Jordan"
            />
          </div>
          <div>
            <label className="label">Last name</label>
            <input
              className="input"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="Rivera"
            />
          </div>
        </div>

        {/* company */}
        <div>
          <div className="flex items-center justify-between">
            <label className="label" style={{ marginBottom: 0 }}>
              Link to a company?
            </label>
            <button
              type="button"
              role="switch"
              aria-checked={linkCompany}
              className="switch"
              onClick={() => setLinkCompany((v) => !v)}
              aria-label="Link to a company"
            />
          </div>
          {linkCompany && (
            <input
              className="input mt-2.5"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              placeholder="Company name"
            />
          )}
        </div>

        {/* emails */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="label flex items-center gap-1.5" style={{ marginBottom: 0 }}>
              <Mail size={13} className="text-tertiary" /> Emails <span className="text-tertiary font-normal">optional</span>
            </label>
            <button type="button" className="btn btn-secondary btn-sm" onClick={emailOps.add}>
              <Plus size={14} /> Add
            </button>
          </div>
          {repeater(emails, emailOps, "name@company.com", "email")}
        </div>

        {/* phones */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="label flex items-center gap-1.5" style={{ marginBottom: 0 }}>
              <Phone size={13} className="text-tertiary" /> Phone numbers
            </label>
            <button type="button" className="btn btn-secondary btn-sm" onClick={phoneOps.add}>
              <Plus size={14} /> Add
            </button>
          </div>
          {repeater(phones, phoneOps, "+1 555 000 1234", "tel")}
        </div>

        {/* tags */}
        <div>
          <label className="label">Tags</label>
          <input
            className="input"
            value={tagsInput}
            onChange={(e) => setTagsInput(e.target.value)}
            placeholder="Separate with commas, e.g. vip, newsletter, west coast"
          />
        </div>

        {/* footer */}
        <div className="mt-1 flex justify-end gap-2">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={save} disabled={saving}>
            {saving ? <Spinner size={16} /> : <Plus size={16} />} Create contact
          </button>
        </div>
      </div>
    </Modal>
  );
}
