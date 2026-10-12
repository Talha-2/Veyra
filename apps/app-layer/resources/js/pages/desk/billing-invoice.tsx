import { Head, Link, useForm } from "@inertiajs/react";
import { useState } from "react";
import {
    DeskPage,
    Panel,
    PanelHeader,
} from "../../components/desk-pages/layout";
import { PageHeader } from "../../components/ui/page";
import Sidebar from "../../components/ui/sidebar";
import { Errors, Field, fieldClass, money, toMinor } from "./billing-ui";
type Invoice = {
    id: number;
    status: string;
    total_minor: number;
    paid_minor: number;
    void_reason: string | null;
    lines: {
        description: string;
        quantity: number;
        unit_price_minor: number;
        total_minor: number;
    }[];
};
export default function InvoicePage({
    invoice,
    patient,
    clinic,
    payments,
    history,
    can_configure,
}: {
    invoice: Invoice;
    patient: { id: number; name: string; mrn: string };
    clinic: { name: string; timezone: string };
    payments: {
        id: number;
        amount_minor: number;
        reference: string;
        method: string;
        created_at: string;
    }[];
    history: { id: number; description: string; actor: string; at: string }[];
    can_configure: boolean;
}) {
    const [mode, setMode] = useState<"payment" | "void" | null>(null);
    const payment = useForm({ amount: "", reference: "", method: "cash" });
    const voiding = useForm({ reason: "" });
    const issuing = useForm({});
    const busy = payment.processing || voiding.processing || issuing.processing;
    return (
        <>
            <style>{`@media print { body * { visibility: hidden; } #clinic-receipt, #clinic-receipt * { visibility: visible; } #clinic-receipt { display: block !important; position: absolute; left: 0; top: 0; width: 100%; padding: 24px; color: #000; background: #fff; } }`}</style>
            <article id="clinic-receipt" className="hidden">
                <h1 className="text-2xl font-bold">{clinic.name}</h1>
                <h2 className="mt-4 text-xl">
                    Invoice #{invoice.id} · {invoice.status}
                </h2>
                <p className="mt-2">
                    {patient.name} · {patient.mrn}
                </p>
                <table className="mt-6 w-full text-left">
                    <thead>
                        <tr>
                            <th>Description</th>
                            <th>Quantity</th>
                            <th>Unit price</th>
                            <th>Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        {invoice.lines.map((l, n) => (
                            <tr key={n}>
                                <td className="py-2">{l.description}</td>
                                <td>{l.quantity}</td>
                                <td>{money(l.unit_price_minor)}</td>
                                <td>{money(l.total_minor)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                <p className="mt-6">
                    Total: {money(invoice.total_minor)} · Paid:{" "}
                    {money(invoice.paid_minor)} · Balance:{" "}
                    {money(invoice.total_minor - invoice.paid_minor)}
                </p>
                {invoice.void_reason && <p>Voided: {invoice.void_reason}</p>}
                <h3 className="mt-6 font-bold">Payment receipts</h3>
                {payments.map((p) => (
                    <p className="mt-2" key={p.id}>
                        Receipt #{p.id} · {p.reference} · {p.method} ·{" "}
                        {money(p.amount_minor)} ·{" "}
                        {new Date(p.created_at).toLocaleString("en-PK", {
                            timeZone: clinic.timezone,
                        })}
                    </p>
                ))}
            </article>
            <Head title={"Invoice #" + invoice.id} />
            <DeskPage
                header={
                    <PageHeader
                        title={"Invoice #" + invoice.id}
                        description={clinic.name + " · " + invoice.status}
                        actions={
                            <div className="flex flex-wrap gap-2">
                                <button
                                    className="v-btn v-btn--secondary"
                                    onClick={() => window.print()}
                                >
                                    Print invoice / receipt
                                </button>
                                {invoice.status === "draft" && (
                                    <button
                                        className="v-btn v-btn--primary"
                                        disabled={issuing.processing}
                                        onClick={() =>
                                            issuing.post(
                                                "/desk/billing/" +
                                                    invoice.id +
                                                    "/issue",
                                            )
                                        }
                                    >
                                        Issue invoice
                                    </button>
                                )}
                                {invoice.status === "issued" &&
                                    invoice.paid_minor <
                                        invoice.total_minor && (
                                        <button
                                            className="v-btn v-btn--primary"
                                            onClick={() => setMode("payment")}
                                        >
                                            Record payment
                                        </button>
                                    )}
                                {can_configure &&
                                    invoice.status !== "void" &&
                                    invoice.paid_minor === 0 && (
                                        <button
                                            className="v-btn v-btn--ghost"
                                            onClick={() => setMode("void")}
                                        >
                                            Void invoice
                                        </button>
                                    )}
                            </div>
                        }
                    />
                }
            >
                <section className="space-y-6">
                    <Link
                        href={"/desk/patients/" + patient.id}
                        className="text-sm underline"
                    >
                        {patient.name} · {patient.mrn}
                    </Link>
                    <Errors errors={issuing.errors} />
                    <Panel>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm tabular-nums">
                                <thead>
                                    <tr>
                                        {[
                                            "Description",
                                            "Qty",
                                            "Unit price",
                                            "Total",
                                        ].map((h) => (
                                            <th className="px-5 py-4" key={h}>
                                                {h}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {invoice.lines.map((line, n) => (
                                        <tr
                                            className="border-t border-border"
                                            key={n}
                                        >
                                            <td className="px-5 py-4">
                                                {line.description}
                                            </td>
                                            <td className="px-5 py-4">
                                                {line.quantity}
                                            </td>
                                            <td className="px-5 py-4">
                                                {money(line.unit_price_minor)}
                                            </td>
                                            <td className="px-5 py-4">
                                                {money(line.total_minor)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <div className="flex flex-wrap justify-end gap-8 border-t border-border p-6 text-sm tabular-nums">
                            <p>
                                Total{" "}
                                <strong>{money(invoice.total_minor)}</strong>
                            </p>
                            <p>
                                Paid{" "}
                                <strong>{money(invoice.paid_minor)}</strong>
                            </p>
                            <p>
                                Balance{" "}
                                <strong>
                                    {money(
                                        invoice.total_minor -
                                            invoice.paid_minor,
                                    )}
                                </strong>
                            </p>
                        </div>
                        {invoice.void_reason && (
                            <p className="p-5">Voided: {invoice.void_reason}</p>
                        )}
                    </Panel>
                    <Panel>
                        <PanelHeader title="Payment receipts" />
                        <div className="divide-y divide-border">
                            {payments.map((p) => (
                                <div
                                    key={p.id}
                                    className="flex flex-wrap items-start justify-between gap-4 px-6 py-5 text-sm"
                                >
                                    <div>
                                        <strong>
                                            Receipt #{p.id} · {p.reference}
                                        </strong>
                                        <p className="mt-1 text-secondary">
                                            {p.method} ·{" "}
                                            {new Date(
                                                p.created_at,
                                            ).toLocaleString("en-PK", {
                                                timeZone: clinic.timezone,
                                            })}
                                        </p>
                                    </div>
                                    <strong>{money(p.amount_minor)}</strong>
                                </div>
                            ))}
                            {!payments.length && (
                                <p className="p-5 text-sm text-secondary">
                                    No payments recorded.
                                </p>
                            )}
                        </div>
                    </Panel>
                    <Panel>
                        <PanelHeader title="Invoice history" />
                        <div className="divide-y divide-border">
                            {history.map((a) => (
                                <p key={a.id} className="p-5 text-sm">
                                    {a.description}
                                    <span className="block mt-1 text-secondary">
                                        {a.actor} ·{" "}
                                        {new Date(a.at).toLocaleString(
                                            "en-PK",
                                            { timeZone: clinic.timezone },
                                        )}
                                    </span>
                                </p>
                            ))}
                        </div>
                    </Panel>
                </section>
            </DeskPage>
            <Sidebar
                open={mode !== null}
                onClose={() => { if (!busy) setMode(null); }}
                title={mode === "payment" ? "Record payment" : "Void invoice"}
            >
                {mode === "payment" ? (
                    <form
                        aria-busy={busy}
                        className="space-y-6"
                        onSubmit={(e) => {
                            e.preventDefault();
                            if (payment.processing) return;
                            payment.transform((d) => ({
                                amount_minor: toMinor(d.amount),
                                reference: d.reference,
                                method: d.method,
                            }));
                            payment.post(
                                "/desk/billing/" + invoice.id + "/payments",
                                {
                                    onSuccess: () => {
                                        setMode(null);
                                        payment.reset();
                                    },
                                },
                            );
                        }}
                    >
                        <fieldset disabled={payment.processing} className="m-0 min-w-0 space-y-5 border-0 p-0">
                            <Field label="Amount · PKR">
                                <input
                                    required
                                    inputMode="decimal"
                                    className={fieldClass}
                                    value={payment.data.amount}
                                    onChange={(e) =>
                                        payment.setData("amount", e.target.value)
                                    }
                                />
                            </Field>
                            <Field label="Payment reference">
                                <input
                                    required
                                    className={fieldClass}
                                    value={payment.data.reference}
                                    onChange={(e) =>
                                        payment.setData("reference", e.target.value)
                                    }
                                />
                            </Field>
                            <p className="text-sm text-secondary">
                                Use the bank transaction ID or a unique cash receipt
                                reference. Reusing the same reference safely retries
                                the same payment.
                            </p>
                            <Field label="Method">
                                <select
                                    className={fieldClass}
                                    value={payment.data.method}
                                    onChange={(e) =>
                                        payment.setData("method", e.target.value)
                                    }
                                >
                                    {["cash", "bank", "card"].map((m) => (
                                        <option key={m}>{m}</option>
                                    ))}
                                </select>
                            </Field>
                            <Errors errors={payment.errors} />
                            <button
                                className="v-btn v-btn--primary"
                                disabled={payment.processing}
                            >
                                Save payment
                            </button>
                        </fieldset>
                    </form>
                ) : (
                    <form
                        aria-busy={busy}
                        className="space-y-6"
                        onSubmit={(e) => {
                            e.preventDefault();
                            if (voiding.processing) return;
                            voiding.post(
                                "/desk/billing/" + invoice.id + "/void",
                                { onSuccess: () => setMode(null) },
                            );
                        }}
                    >
                        <fieldset disabled={voiding.processing} className="m-0 min-w-0 space-y-5 border-0 p-0">
                            <Field label="Reason">
                                <textarea
                                    required
                                    className={fieldClass}
                                    value={voiding.data.reason}
                                    onChange={(e) =>
                                        voiding.setData("reason", e.target.value)
                                    }
                                />
                            </Field>
                            <Errors errors={voiding.errors} />
                            <button
                                className="v-btn v-btn--primary"
                                disabled={voiding.processing}
                            >
                                Void invoice
                            </button>
                        </fieldset>
                    </form>
                )}
            </Sidebar>
        </>
    );
}
