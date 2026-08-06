import { redirect } from "next/navigation";

import { routes } from "@/lib/routes";

/** The console opens on what needs a person. Nothing else earns the root. */
export default function Root() {
  redirect(routes.queue);
}
