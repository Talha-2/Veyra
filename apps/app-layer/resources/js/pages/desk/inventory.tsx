import { Head, Link, useForm } from "@inertiajs/react";
import { useState } from "react";
import {
    DeskPage,
    Panel,
    PanelHeader,
} from "../../components/desk-pages/layout";
import { PageHeader } from "../../components/ui/page";
import Sidebar from "../../components/ui/sidebar";
import { Badge } from "../../components/ui/primitives";
import { PageLinks } from "../../components/desk-pages/bits";
import {
    Errors,
    Field,
    PatientContext,
    PatientSelect,
    fieldClass,
    type PatientOption,
} from "./billing-ui";
import type { PageResult } from "../../types/healthcare";
type Item = { id: number; name: string; unit: string };
type Batch = {
    id: number;
    inventory_item_id: number;
    batch_number: string;
    expires_on: string;
    quantity: number;
};
type Movement = {
    id: number;
    inventory_batch_id: number;
    quantity: number;
    kind: string;
    reason: string;
    reference: string;
    patient_id: number | null;
    created_at: string;
    user?: { name: string } | null;
};
export default function Inventory({
    items,
    batches,
    movements,
    patients,
    patient_id,
    can_configure,
    clinic_date,
}: {
    items: Item[];
    batches: Batch[];
    movements: PageResult<Movement>;
    patients: PatientOption[];
    patient_id: number | null;
    can_configure: boolean;
    clinic_date: string;
}) {
    const [mode, setMode] = useState<"item" | "batch" | "move" | null>(null);
    const [selected, setSelected] = useState<Batch | null>(null);
    const item = useForm({ name: "", unit: "piece" });
    const batch = useForm({
        inventory_item_id: "",
        batch_number: "",
        expires_on: "",
        quantity: 0,
    });
    const move = useForm({
        patient_id: String(patient_id ?? ""),
        kind: "dispense",
        quantity: 1,
        reason: "",
        reference: "",
    });
    const busy = item.processing || batch.processing || move.processing;
    return (
        <>
            <Head title="Inventory" />
            <DeskPage
                header={
                    <PageHeader
                        title="Inventory"
                        description="Track batches, expiry dates and every stock movement."
                        actions={
                            can_configure && (
                                <div className="flex gap-2">
                                    <button
                                        className="v-btn v-btn--secondary"
                                        onClick={() => setMode("item")}
                                    >
                                        Add item
                                    </button>
                                    <button
                                        className="v-btn v-btn--primary"
                                        onClick={() => setMode("batch")}
                                    >
                                        Receive batch
                                    </button>
                                </div>
                            )
                        }
                    />
                }
            >
                <section className="space-y-6">
                    <PatientContext
                        patients={patients}
                        patient_id={patient_id}
                    />
                    <Panel>
                        <PanelHeader title="Stock by batch" />
                        <div className="divide-y divide-border">
                            {batches.map((b) => {
                                const i = items.find(
                                    (i) => i.id === b.inventory_item_id,
                                );
                                const expired =
                                    b.expires_on.slice(0, 10) <= clinic_date;
                                return (
                                    <div
                                        key={b.id}
                                        className="flex flex-wrap items-start justify-between gap-5 px-6 py-5"
                                    >
                                        <div>
                                            <strong>
                                                {i?.name ?? "Inventory item"} · {b.batch_number}
                                            </strong>
                                            <p className="mt-1 text-sm text-secondary">
                                                <span className="font-medium text-primary tabular-nums">{b.quantity} {i?.unit}</span> · Expires{" "}
                                                {new Date(b.expires_on.slice(0, 10) + "T12:00:00").toLocaleDateString("en-PK", { day: "numeric", month: "short", year: "numeric" })}
                                            </p>
                                        </div>
                                        <div className="flex flex-wrap items-center gap-2">
                                            {expired && <Badge tone="danger">Expired</Badge>}
                                            {b.quantity === 0 && <Badge>Out of stock</Badge>}
                                            <button
                                                disabled={
                                                    expired || b.quantity === 0
                                                }
                                                className="v-btn v-btn--secondary"
                                                onClick={() => {
                                                    setSelected(b);
                                                    move.setData({
                                                        patient_id: String(
                                                            patient_id ?? "",
                                                        ),
                                                        kind: "dispense",
                                                        quantity: 1,
                                                        reason: "",
                                                        reference:
                                                            crypto.randomUUID(),
                                                    });
                                                    setMode("move");
                                                }}
                                            >
                                                Dispense
                                            </button>
                                            {can_configure && (
                                                <button
                                                    className="v-btn v-btn--ghost"
                                                    onClick={() => {
                                                        setSelected(b);
                                                        move.setData({
                                                            patient_id: "",
                                                            kind: "adjustment",
                                                            quantity: 1,
                                                            reason: "",
                                                            reference:
                                                                crypto.randomUUID(),
                                                        });
                                                        setMode("move");
                                                    }}
                                                >
                                                    Adjust stock
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                            {!batches.length && (
                                <p className="p-8 text-secondary">
                                    No stock batches yet. A clinic administrator
                                    can configure items and receive stock.
                                </p>
                            )}
                        </div>
                    </Panel>
                    <Panel>
                        <PanelHeader title="Stock ledger" />
                        <div className="divide-y divide-border">
                            {movements.data.map((m) => (
                                <div
                                    key={m.id}
                                    className="flex flex-wrap items-start justify-between gap-5 px-6 py-5 text-sm"
                                >
                                    <div>
                                        <strong>
                                            {
                                                items.find(
                                                    (i) =>
                                                        i.id ===
                                                        batches.find(
                                                            (b) =>
                                                                b.id ===
                                                                m.inventory_batch_id,
                                                        )?.inventory_item_id,
                                                )?.name
                                            }{" "}
                                            · {m.kind}
                                        </strong>
                                        <p className="mt-2 break-words text-secondary">
                                            {m.reason} · {m.reference}
                                            <span className="block mt-1">
                                                {m.user?.name ??
                                                    "Former member"}{" "}
                                                ·{" "}
                                                {new Date(
                                                    m.created_at,
                                                ).toLocaleDateString("en-PK")}
                                            </span>
                                        </p>
                                        {m.patient_id && (
                                            <Link
                                                className="underline"
                                                href={
                                                    "/desk/patients/" +
                                                    m.patient_id
                                                }
                                            >
                                                {patients.find(
                                                    (p) =>
                                                        p.id === m.patient_id,
                                                )?.name ?? "Patient record"}
                                            </Link>
                                        )}
                                    </div>
                                    <strong className="shrink-0 tabular-nums">
                                        {m.quantity > 0 ? "+" : ""}
                                        {m.quantity}
                                    </strong>
                                </div>
                            ))}
                            {!movements.data.length && (
                                <p className="p-5 text-secondary">
                                    No stock movements recorded.
                                </p>
                            )}
                        </div>
                    </Panel>
                    <PageLinks
                        links={movements.links}
                        summary={movements.total + " movements"}
                    />
                </section>
            </DeskPage>
            <Sidebar
                open={mode !== null}
                onClose={() => { if (!busy) setMode(null); }}
                title={
                    mode === "item"
                        ? "Configure inventory item"
                        : mode === "batch"
                          ? "Receive stock batch"
                          : move.data.kind === "dispense"
                            ? "Dispense stock"
                            : "Adjust stock"
                }
            >
                {mode === "item" ? (
                    <form
                        aria-busy={busy}
                        className="space-y-6"
                        onSubmit={(e) => {
                            e.preventDefault();
                            if (item.processing) return;
                            item.post("/desk/inventory/items", {
                                onSuccess: () => {
                                    setMode(null);
                                    item.reset();
                                },
                            });
                        }}
                    >
                        <fieldset disabled={item.processing} className="m-0 min-w-0 space-y-5 border-0 p-0">
                            <Field label="Item name">
                                <input
                                    required
                                    className={fieldClass}
                                    value={item.data.name}
                                    onChange={(e) =>
                                        item.setData("name", e.target.value)
                                    }
                                />
                            </Field>
                            <Field label="Stock unit">
                                <input
                                    required
                                    className={fieldClass}
                                    value={item.data.unit}
                                    onChange={(e) =>
                                        item.setData("unit", e.target.value)
                                    }
                                />
                            </Field>
                            <Errors errors={item.errors} />
                            <button
                                className="v-btn v-btn--primary"
                                disabled={item.processing}
                            >
                                Add item
                            </button>
                        </fieldset>
                    </form>
                ) : mode === "batch" ? (
                    <form
                        aria-busy={busy}
                        className="space-y-6"
                        onSubmit={(e) => {
                            e.preventDefault();
                            if (batch.processing) return;
                            batch.post("/desk/inventory/batches", {
                                onSuccess: () => {
                                    setMode(null);
                                    batch.reset();
                                },
                            });
                        }}
                    >
                        <fieldset disabled={batch.processing} className="m-0 min-w-0 space-y-5 border-0 p-0">
                            <Field label="Item">
                                <select
                                    required
                                    className={fieldClass}
                                    value={batch.data.inventory_item_id}
                                    onChange={(e) =>
                                        batch.setData(
                                            "inventory_item_id",
                                            e.target.value,
                                        )
                                    }
                                >
                                    <option value="">Choose item</option>
                                    {items.map((i) => (
                                        <option value={i.id} key={i.id}>
                                            {i.name}
                                        </option>
                                    ))}
                                </select>
                            </Field>
                            <Field label="Batch number">
                                <input
                                    required
                                    className={fieldClass}
                                    value={batch.data.batch_number}
                                    onChange={(e) =>
                                        batch.setData(
                                            "batch_number",
                                            e.target.value,
                                        )
                                    }
                                />
                            </Field>
                            <Field label="Expiry date">
                                <input
                                    required
                                    type="date"
                                    className={fieldClass}
                                    value={batch.data.expires_on}
                                    onChange={(e) =>
                                        batch.setData("expires_on", e.target.value)
                                    }
                                />
                            </Field>
                            <Field label="Opening quantity">
                                <input
                                    required
                                    type="number"
                                    min="0"
                                    className={fieldClass}
                                    value={batch.data.quantity}
                                    onChange={(e) =>
                                        batch.setData(
                                            "quantity",
                                            Number(e.target.value),
                                        )
                                    }
                                />
                            </Field>
                            <Errors errors={batch.errors} />
                            <button
                                className="v-btn v-btn--primary"
                                disabled={batch.processing}
                            >
                                Receive stock
                            </button>
                        </fieldset>
                    </form>
                ) : (
                    <form
                        aria-busy={busy}
                        className="space-y-6"
                        onSubmit={(e) => {
                            e.preventDefault();
                            if (move.processing) return;
                            move.transform((d) => ({
                                ...d,
                                quantity:
                                    d.kind === "dispense"
                                        ? -Math.abs(d.quantity)
                                        : d.quantity,
                            }));
                            move.post(
                                "/desk/inventory/" + selected?.id + "/move",
                                { onSuccess: () => setMode(null) },
                            );
                        }}
                    >
                        <fieldset disabled={move.processing} className="m-0 min-w-0 space-y-5 border-0 p-0">
                            <p className="text-sm text-secondary">
                                Batch {selected?.batch_number} ·{" "}
                                {selected?.quantity} available
                            </p>
                            {move.data.kind === "dispense" && (
                                <PatientSelect
                                    patients={patients}
                                    value={move.data.patient_id}
                                    onChange={(v) => move.setData("patient_id", v)}
                                />
                            )}
                            <Field
                                label={
                                    move.data.kind === "dispense"
                                        ? "Quantity to dispense"
                                        : "Quantity change · positive adds, negative removes"
                                }
                            >
                                <input
                                    required
                                    type="number"
                                    min={
                                        move.data.kind === "dispense"
                                            ? 1
                                            : undefined
                                    }
                                    className={fieldClass}
                                    value={move.data.quantity}
                                    onChange={(e) =>
                                        move.setData(
                                            "quantity",
                                            Number(e.target.value),
                                        )
                                    }
                                />
                            </Field>
                            <Field label="Reason">
                                <input
                                    required
                                    className={fieldClass}
                                    value={move.data.reason}
                                    onChange={(e) =>
                                        move.setData("reason", e.target.value)
                                    }
                                />
                            </Field>
                            <Errors errors={move.errors} />
                            <button
                                className="v-btn v-btn--primary"
                                disabled={move.processing}
                            >
                                Save stock movement
                            </button>
                        </fieldset>
                    </form>
                )}
            </Sidebar>
        </>
    );
}
