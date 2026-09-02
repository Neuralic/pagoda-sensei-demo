import { redirect } from "next/navigation";

/** Public guide signup is operator-only; team guides join via operator invite links. */
export default function GuideSignupPage() {
  redirect("/auth/signup/operator");
}
