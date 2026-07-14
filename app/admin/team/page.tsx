import { redirect } from "next/navigation";

/** Team management moved into Settings. */
export default function TeamRedirectPage() {
  redirect("/admin/settings");
}
