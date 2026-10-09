import { redirect } from "next/navigation";

/** My notes is the home screen; the safety check-in lives on its own route. */
export default function Home() {
  redirect("/notes");
}
