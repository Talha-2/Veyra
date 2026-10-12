import { Head, Link, useForm } from "@inertiajs/react";
import { useState } from "react";
import { DeskPage, Panel } from "../../components/desk-pages/layout";
import { PageHeader } from "../../components/ui/page";
import Sidebar from "../../components/ui/sidebar";
import { PageLinks } from "../../components/desk-pages/bits";
import {
    Errors,
    Field,
    PatientContext,
    PatientSelect,
    fieldClass,
    money,
    toMinor,
    type PatientOption,
} from "./billing-ui";
import type { PageResult } from "../../types/healthcare";
type Invoice = {
    id: number;
    patient_id: number;
    status: string;
    total_minor: number;
    paid_minor: number;
};
export default function Billing({
    invoices,
    patients,
    patient_id,
}: {
    invoices: PageResult<Invoice>;
    patients: PatientOption[];
    patient_id: number | null;
}) {
    const [open, setOpen] = useState(false);
    const form = useForm({
        patient_id: String(patient_id ?? ""),
        lines: [{ description: "Consultation", quantity: 1, price: "" }],
    });
    return (
        <>
            <Head title="Billing" />
            <DeskPage
                header={
                    <PageHeader
                        title="Billing"
                        description="Patient invoices and payment records in Pakistani rupees."
                        actions={
                            <button
                                className="v-btn v-btn--primary"
                                onClick={() => setOpen(true)}
                            >
                                Create invoice
                            </button>
                        }
                    />
                }
            >
                <section>
                    <PatientContext
                        patients={patients}
                        patient_id={patient_id}
                    />
                    <Panel>
                        <div className="divide-y divide-border">
                            {invoices.data.map((i) => (
                                <Link
                                    key={i.id}
                                    href={"/desk/billing/" + i.id}
                                    className="flex flex-wrap items-center justify-between gap-4 px-5 py-4 hover:bg-surface-hover"
                                >
                                    <div>
                                        <strong>Invoice #{i.id}</strong>
                                        <p className="mt-1 text-sm text-secondary">
                                            {patients.find(
                                                (p) => p.id === i.patient_id,
                                            )?.name ?? "Patient"}{" "}
                                            {patients.find((p) => p.id === i.patient_id)?.mrn && " · " + patients.find((p) => p.id === i.patient_id)?.mrn}
                                            · {i.status}
                                        </p>
                                    </div>
                                    <div className="text-right text-sm tabular-nums">
                                        <strong>{money(i.total_minor)}</strong>
                                        <p className="mt-1 text-secondary">
                                            Balance{" "}
                                            {money(
                                                i.total_minor - i.paid_minor,
                                            )}
                                        </p>
                                    </div>
                                </Link>
                            ))}
                            {!invoices.data.length && (
                                <p className="p-8 text-secondary">
                                    No invoices yet. Create a patient invoice to
                                    get started.
                                </p>
                            )}
                        </div>
                    </Panel>
                    <PageLinks
                        links={invoices.links}
                        summary={invoices.total + " invoices"}
                    />
                </section>
            </DeskPage>
            <Sidebar
                open={open}
                onClose={() => { if (!form.processing) setOpen(false); }}
                title="Create patient invoice"
                description="Line descriptions and prices are saved as a permanent invoice snapshot."
            >
                <form
                    aria-busy={form.processing}
                    className="space-y-6"
                    onSubmit={(e) => {
                        e.preventDefault();
                        if (form.processing) return;
                        form.transform((data) => ({
                            patient_id: data.patient_id,
                            lines: data.lines.map((line) => ({
                                description: line.description,
                                quantity: line.quantity,
                                unit_price_minor: toMinor(line.price),
                            })),
                        }));
                        form.post("/desk/billing", {
                            onSuccess: () => setOpen(false),
                        });
                    }}
                >
                    <fieldset disabled={form.processing} className="m-0 min-w-0 space-y-5 border-0 p-0">
                        <PatientSelect
                            patients={patients}
                            value={form.data.patient_id}
                            onChange={(value) => form.setData("patient_id", value)}
                        />
                        {form.data.lines.map((line, index) => (
                            <div
                                key={index}
                                className="space-y-4 border-b border-border pb-5"
                            >
                                <Field label="Description">
                                    <input
                                        required
                                        className={fieldClass}
                                        value={line.description}
                                        onChange={(e) =>
                                            form.setData(
                                                "lines",
                                                form.data.lines.map((l, n) =>
                                                    n === index
                                                        ? {
                                                              ...l,
                                                              description:
                                                                  e.target.value,
                                                          }
                                                        : l,
                                                ),
                                            )
                                        }
                                    />
                                </Field>
                                <div className="grid grid-cols-2 gap-3">
                                    <Field label="Quantity">
                                        <input
                                            required
                                            type="number"
                                            min="1"
                                            className={fieldClass}
                                            value={line.quantity}
                                            onChange={(e) =>
                                                form.setData(
                                                    "lines",
                                                    form.data.lines.map((l, n) =>
                                                        n === index
                                                            ? {
                                                                  ...l,
                                                                  quantity: Number(
                                                                      e.target
                                                                          .value,
                                                                  ),
                                                              }
                                                            : l,
                                                    ),
                                                )
                                            }
                                        />
                                    </Field>
                                    <Field label="Unit price · PKR">
                                        <input
                                            required
                                            inputMode="decimal"
                                            pattern="[0-9]+(\.[0-9]{1,2})?"
                                            className={fieldClass}
                                            value={line.price}
                                            onChange={(e) =>
                                                form.setData(
                                                    "lines",
                                                    form.data.lines.map((l, n) =>
                                                        n === index
                                                            ? {
                                                                  ...l,
                                                                  price: e.target
                                                                      .value,
                                                              }
                                                            : l,
                                                    ),
                                                )
                                            }
                                        />
                                    </Field>
                                </div>
                                {form.data.lines.length > 1 && (
                                    <button
                                        type="button"
                                        className="v-btn v-btn--ghost"
                                        onClick={() =>
                                            form.setData(
                                                "lines",
                                                form.data.lines.filter(
                                                    (_, n) => n !== index,
                                                ),
                                            )
                                        }
                                    >
                                        Remove line
                                    </button>
                                )}
                            </div>
                        ))}
                        <button
                            type="button"
                            className="v-btn v-btn--secondary"
                            onClick={() =>
                                form.setData("lines", [
                                    ...form.data.lines,
                                    { description: "", quantity: 1, price: "" },
                                ])
                            }
                        >
                            Add line
                        </button>
                        <Errors errors={form.errors} />
                        <button
                            disabled={form.processing}
                            className="v-btn v-btn--primary"
                        >
                            Save draft
                        </button>
                    </fieldset>
                </form>
            </Sidebar>
        </>
    );
}
