import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";

export default async function HomePage() {
  const session = await getSessionUser();
  if (session) {
    redirect("/dashboard");
  } else {
    redirect("/login");
  }
}
