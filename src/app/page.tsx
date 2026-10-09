import { redirect } from "next/navigation";

/** The app opens on the dashboard. */
export default function Home() {
  redirect("/dashboard");
}