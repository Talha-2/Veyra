"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { SectionCard, Spinner } from "@/components/ui";
import { toast } from "sonner";
import { Check, TriangleAlert } from "lucide-react";

/* The profile is what the agent knows before the caller says anything. It is
   deliberately not the knowledge base: these facts go straight into the system
   prompt on every call, so "are you open now" is answered instantly instead of
   triggering a retrieval round trip that the caller hears as dead air. */

type Field = {
  key: string;
  label: string;
  hint: string;
  area?: boolean;
  required?: boolean;
  placeholder?: string;
};

const GROUPS: { title: string; blurb: string; fields: Field[] }[] = [
  {
    title: "Identity",
    blurb: "Without these the agent does not know who it works for.",
    fields: [
      { key: "name", label: "Business name", hint: "Said in the greeting", required: true, placeholder: "Northside Dental" },
      { key: "what_we_do", label: "What the business does", hint: "One sentence, plain language", required: true, area: true, placeholder: "A family dental clinic offering checkups, cleanings and emergency care." },
      { key: "pronunciation", label: "How to say the name", hint: "Only if it is not obvious. Write it how it sounds.", placeholder: "NORTH side dental" },
    ],
  },
  {
    title: "Logistics",
    blurb: "Answered constantly on real calls. Timezone drives every appointment the agent books.",
    fields: [
      { key: "timezone", label: "Timezone", hint: "Every time the agent says is in this zone", required: true, placeholder: "Asia/Karachi" },
      { key: "hours", label: "Opening hours", hint: "Include the days you are closed", required: true, area: true, placeholder: "Monday to Friday, 9am to 6pm. Closed weekends and public holidays." },
      { key: "address", label: "Address", hint: "Read aloud when callers ask for directions", area: true },
      { key: "phone", label: "Main phone number", hint: "Used for callbacks and transfers" },
      { key: "website", label: "Website", hint: "The agent spells this slowly if asked" },
    ],
  },
  {
    title: "What you sell",
    blurb: "The agent quotes from this directly. Anything longer belongs in the knowledge base.",
    fields: [
      { key: "services", label: "Services offered", hint: "One per line", area: true },
      { key: "pricing", label: "Pricing", hint: "Leave blank if the agent should never quote a price", area: true },
    ],
  },
  {
    title: "Boundaries",
    blurb: "What the agent does when it reaches the edge of what it should handle.",
    fields: [
      { key: "policies", label: "Policies", hint: "Cancellation, payment, refunds", area: true },
      { key: "escalation", label: "When to transfer to a human", hint: "Be specific. Vague rules make the agent transfer everything.", area: true, placeholder: "Transfer any billing dispute, or any caller who asks twice for a person." },
      { key: "notes", label: "Other things to know", hint: "Anything that does not fit above", area: true },
    ],
  },
];

export default function BusinessProfile() {
  const [profile, setProfile] = useState<Record<string, string> | null>(null);
  const [status, setStatus] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [preview, setPreview] = useState(false);
  const [prompt, setPrompt] = useState("");

  useEffect(() => {
    api.get("/api/business").then((d) => {
      const { _status, _prompt, ...rest } = d;
      setProfile(rest);
      setStatus(_status);
      setPrompt(_prompt || "");
    }).catch((e) => toast.error("Could not load profile", { description: e.message }));
  }, []);

  const set = (k: string, v: string) => {
    setProfile((p) => ({ ...(p || {}), [k]: v }));
    setDirty(true);
  };

  const save = async () => {
    if (!profile) return;
    setSaving(true);
    try {
      const d = await api.put("/api/business", profile);
      const { _status, _prompt, ...rest } = d;
      setProfile(rest);
      setStatus(_status);
      setPrompt(_prompt || "");
      setDirty(false);
      toast.success("Profile saved", { description: "The next call uses it." });
    } catch (e: any) {
      toast.error("Could not save", { description: e.message });
    } finally {
      setSaving(false);
    }
  };

  if (!profile) return <div className="flex justify-center p-10"><Spinner size={20} /></div>;

  const missing: string[] = status?.missing_required || [];
  const labelFor = (k: string) =>
    GROUPS.flatMap((g) => g.fields).find((f) => f.key === k)?.label || k;

  return (
    <div className="space-y-4">
      <div className={`biz-status ${status?.ready ? "ok" : "warn"}`}>
        {status?.ready ? (
          <>
            <Check size={15} style={{ color: "var(--success)", flexShrink: 0 }} />
            <div>
              <div className="biz-status__title">The agent knows who it works for</div>
              <div className="biz-status__sub">
                {status.filled} of {status.total} fields filled. These facts are in the system prompt on every call.
              </div>
            </div>
          </>
        ) : (
          <>
            <TriangleAlert size={15} style={{ color: "var(--warning)", flexShrink: 0 }} />
            <div>
              <div className="biz-status__title">The agent does not know who it works for</div>
              <div className="biz-status__sub">
                Still needed: {missing.map(labelFor).join(", ")}. Until these are set the agent
                answers basic questions by searching the knowledge base, which sounds like software.
              </div>
            </div>
          </>
        )}
      </div>

      {GROUPS.map((group) => (
        <SectionCard key={group.title} title={group.title} description={group.blurb}>
          <div className="space-y-3">
            {group.fields.map((f) => (
              <div key={f.key}>
                <label className="label">
                  {f.label}
                  {f.required && <span className="req"> required</span>}
                </label>
                {f.area ? (
                  <textarea
                    className="input"
                    rows={f.key === "what_we_do" || f.key === "hours" ? 2 : 3}
                    value={profile[f.key] || ""}
                    placeholder={f.placeholder}
                    onChange={(e) => set(f.key, e.target.value)}
                  />
                ) : (
                  <input
                    className="input h-9"
                    value={profile[f.key] || ""}
                    placeholder={f.placeholder}
                    onChange={(e) => set(f.key, e.target.value)}
                  />
                )}
                <p className="hint">{f.hint}</p>
              </div>
            ))}
          </div>
        </SectionCard>
      ))}

      {prompt && (
        <SectionCard
          title="What the agent actually reads"
          description="The exact text prepended to the system prompt on every call."
        >
          <button className="btn btn-secondary h-8 mb-2" onClick={() => setPreview((v) => !v)}>
            {preview ? "Hide" : "Show"} prompt block
          </button>
          {preview && <pre className="biz-prompt">{prompt}</pre>}
        </SectionCard>
      )}

      <div className="biz-save">
        <button className="btn btn-primary" onClick={save} disabled={saving || !dirty}>
          {saving ? <Spinner size={15} /> : <Check size={15} />}
          {dirty ? "Save profile" : "Saved"}
        </button>
      </div>
    </div>
  );
}
