import { redirect } from "next/navigation";

// Abilities merged into Workflows (visual node editor).
export default function AbilitiesRedirect() {
  redirect("/studio/workflows");
}
