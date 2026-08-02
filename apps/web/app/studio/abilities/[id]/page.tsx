import { redirect } from "next/navigation";

// Abilities merged into Workflows (visual node editor).
export default async function AbilityRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/studio/workflows/${id}`);
}
