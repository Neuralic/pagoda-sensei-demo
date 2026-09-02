import { redirect } from "next/navigation";

/** Guide profile editing lives in Settings; this route is kept only for old bookmarks. */
export default function ProfilePage() {
  redirect("/settings");
}
