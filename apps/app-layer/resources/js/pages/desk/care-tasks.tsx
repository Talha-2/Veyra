import { Head, Link, router, useForm } from "@inertiajs/react";
import { useState } from "react";
import { DeskPage, Panel } from "../../components/desk-pages/layout";
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
type Task = {
    id: number;
    patient_id: number;
    assigned_user_id: number | null;
    kind: string;
    title: string;
    due_on: string;
    status: string;
};
export default function CareTasks({
    tasks,
    patients,
    patient_id,
    members,
    actor_id,
    filters,
    clinic_date,
}: {
    tasks: PageResult<Task>;
    patients: PatientOption[];
    patient_id: number | null;
    members: { id: number; name: string }[];
    actor_id: number;
    filters: { status: string; mine: string | null };
    clinic_date: string;
}) {
    const [open, setOpen] = useState(false);
    const form = useForm({
        patient_id: String(patient_id ?? ""),
        assigned_user_id: String(actor_id),
        kind: "task",
        title: "",
        due_on: clinic_date,
    });
    const status = useForm({ status: "" });
    const visit = (changes: object) =>
        router.get("/desk/care-tasks", {
            ...filters,
            ...(patient_id ? { patient_id } : {}),
            ...changes,
        });
    return (
        <>
            <Head title="Care tasks" />
            <DeskPage
                header={
                    <PageHeader
                        title="Care tasks & recalls"
                        description="Patient follow-ups with clear ownership and due dates. Keep task titles administrative; clinical details belong in the chart."
                        actions={
                            <button
                                className="v-btn v-btn--primary"
                                onClick={() => setOpen(true)}
                            >
                                Add task or recall
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
                    <div className="mb-6 flex flex-wrap items-end gap-4">
                        <Field label="Status">
                            <select
                                className={fieldClass}
                                value={filters.status}
                                onChange={(e) =>
                                    visit({ status: e.target.value })
                                }
                            >
                                {["pending", "done", "cancelled", "all"].map(
                                    (s) => (
                                        <option key={s}>{s}</option>
                                    ),
                                )}
                            </select>
                        </Field>
                        <Field label="Assignment">
                            <select
                                className={fieldClass}
                                value={filters.mine ?? ""}
                                onChange={(e) =>
                                    visit({ mine: e.target.value || undefined })
                                }
                            >
                                <option value="">All clinic tasks</option>
                                <option value="1">Assigned to me</option>
                            </select>
                        </Field>
                    </div>
                    <Errors errors={status.errors} />
                    <Panel>
                        <div className="divide-y divide-border">
                            {tasks.data.map((task) => {
                                const patient = patients.find((p) => p.id === task.patient_id);
                                const owner = members.find((member) => member.id === task.assigned_user_id);
                                const due = task.due_on.slice(0, 10);
                                const overdue = task.status === "pending" && due < clinic_date;
                                const dueToday = task.status === "pending" && due === clinic_date;
                                const changeStatus = (value: string) => {
                                    if (status.processing) return;
                                    status.transform(() => ({ status: value }));
                                    status.patch("/desk/care-tasks/" + task.id);
                                };
                                return (
                                    <article key={task.id} className="grid items-start gap-5 px-6 py-5 lg:grid-cols-[minmax(0,1fr)_180px_auto]">
                                        <div className="min-w-0">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <h2 className="break-words text-base font-semibold text-primary">{task.title}</h2>
                                                <Badge>{task.kind.replaceAll("_", " ")}</Badge>
                                            </div>
                                            <p className="mt-2 text-sm text-secondary">
                                                <Link className="font-medium text-primary underline underline-offset-4" href={"/desk/patients/" + task.patient_id}>
                                                    {patient?.name ?? "Patient record"}{patient?.mrn && " · " + patient.mrn}
                                                </Link>
                                            </p>
                                            <p className="mt-2 text-sm text-secondary">Assigned to {owner?.name ?? (task.assigned_user_id === null ? "no one" : "a former member")}</p>
                                        </div>
                                        <div className="flex flex-wrap items-center gap-2 lg:block">
                                            <p className={"text-sm " + (overdue ? "text-danger" : "text-secondary")}>
                                                Due {new Date(due + "T12:00:00").toLocaleDateString("en-PK", { day: "numeric", month: "short", year: "numeric" })}
                                            </p>
                                            <div className="lg:mt-2"><Badge tone={overdue ? "danger" : task.status === "done" ? "success" : dueToday ? "warning" : "muted"}>
                                                {overdue ? "Overdue" : dueToday ? "Due today" : task.status.charAt(0).toUpperCase() + task.status.slice(1)}
                                            </Badge></div>
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            {task.status === "pending" ? <>
                                                <button type="button" className="v-btn v-btn--primary" disabled={status.processing} onClick={() => changeStatus("done")}>Mark done</button>
                                                <button type="button" className="v-btn v-btn--ghost" disabled={status.processing} onClick={() => changeStatus("cancelled")}>Cancel</button>
                                            </> : <button type="button" className="v-btn v-btn--secondary" disabled={status.processing} onClick={() => changeStatus("pending")}>Reopen</button>}
                                        </div>
                                    </article>
                                );
                            })}
                            {!tasks.data.length && (
                                <p className="p-8 text-secondary">
                                    No tasks match this worklist.
                                </p>
                            )}
                        </div>
                    </Panel>
                    <PageLinks
                        links={tasks.links}
                        summary={tasks.total + " tasks"}
                    />
                </section>
            </DeskPage>
            <Sidebar
                open={open}
                onClose={() => { if (!form.processing) setOpen(false); }}
                title="Add patient task or recall"
            >
                <form
                    aria-busy={form.processing}
                    className="space-y-6"
                    onSubmit={(e) => {
                        e.preventDefault();
                        if (form.processing) return;
                        form.post("/desk/care-tasks", {
                            onSuccess: () => {
                                setOpen(false);
                                form.reset("title");
                            },
                        });
                    }}
                >
                    <fieldset disabled={form.processing} className="m-0 min-w-0 space-y-5 border-0 p-0">
                        <PatientSelect
                            patients={patients}
                            value={form.data.patient_id}
                            onChange={(v) => form.setData("patient_id", v)}
                        />
                        <Field label="Type">
                            <select
                                className={fieldClass}
                                value={form.data.kind}
                                onChange={(e) =>
                                    form.setData("kind", e.target.value)
                                }
                            >
                                <option value="task">Care task</option>
                                <option value="recall">Patient recall</option>
                            </select>
                        </Field>
                        <Field label="Task title">
                            <input
                                required
                                maxLength={200}
                                className={fieldClass}
                                value={form.data.title}
                                onChange={(e) =>
                                    form.setData("title", e.target.value)
                                }
                            />
                        </Field>
                        <Field label="Assigned to">
                            <select
                                required
                                className={fieldClass}
                                value={form.data.assigned_user_id}
                                onChange={(e) =>
                                    form.setData("assigned_user_id", e.target.value)
                                }
                            >
                                {members.map((m) => (
                                    <option key={m.id} value={m.id}>
                                        {m.name}
                                    </option>
                                ))}
                            </select>
                        </Field>
                        <Field label="Due date">
                            <input
                                required
                                type="date"
                                className={fieldClass}
                                value={form.data.due_on}
                                onChange={(e) =>
                                    form.setData("due_on", e.target.value)
                                }
                            />
                        </Field>
                        <Errors errors={form.errors} />
                        <button
                            className="v-btn v-btn--primary"
                            disabled={form.processing}
                        >
                            Create task
                        </button>
                    </fieldset>
                </form>
            </Sidebar>
        </>
    );
}
