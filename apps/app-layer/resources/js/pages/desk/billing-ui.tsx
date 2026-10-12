import { Link } from "@inertiajs/react";
import type { ReactNode } from "react";
export type PatientOption = { id: number; name: string; mrn: string };
export const fieldClass =
    "v-field w-full";
export const money = (minor: number) =>
    new Intl.NumberFormat("en-PK", {
        style: "currency",
        currency: "PKR",
    }).format(minor / 100);
export function toMinor(value: string): number {
    if (!/^\d+(\.\d{1,2})?$/.test(value)) return -1;
    const [whole, fraction = ""] = value.split(".");
    return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}
export function Field({
    label,
    children,
}: {
    label: string;
    children: ReactNode;
}) {
    return (
        <label className="block space-y-2 text-sm font-medium text-secondary">
            <span>{label}</span>
            {children}
        </label>
    );
}
export function Errors({ errors }: { errors: object }) {
    return (
        <>
            {Object.entries(errors).map(([key, value]) => (
                <p key={key} role="alert" className="text-sm text-danger">
                    {String(value)}
                </p>
            ))}
        </>
    );
}
export function PatientSelect({
    patients,
    value,
    onChange,
}: {
    patients: PatientOption[];
    value: string;
    onChange: (value: string) => void;
}) {
    return (
        <Field label="Patient">
            <select
                required
                className={fieldClass}
                value={value}
                onChange={(e) => onChange(e.target.value)}
            >
                <option value="">Choose patient</option>
                {patients.map((p) => (
                    <option key={p.id} value={p.id}>
                        {p.name} · {p.mrn}
                    </option>
                ))}
            </select>
        </Field>
    );
}
export function PatientContext({
    patient_id,
    patients,
}: {
    patient_id?: number | null;
    patients: PatientOption[];
}) {
    const p = patients.find((p) => p.id === patient_id);
    return p ? (
        <p className="mb-4 text-sm text-secondary">
            For{" "}
            <Link
                href={"/desk/patients/" + p.id}
                className="text-primary underline"
            >
                {p.name} · {p.mrn}
            </Link>
        </p>
    ) : null;
}
