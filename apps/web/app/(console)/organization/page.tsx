import { redirect } from "next/navigation";

import { routes } from "@/lib/routes";

/** The organization opens on its machines: the thing people come here for. */
export default function OrganizationRoot() {
  redirect(routes.fleet);
}
