import { redirect } from "next/navigation";

// Keep old bookmarks working while the former separate AI mode becomes part of
// the single inspection workspace. The browser imports its legacy records there.
export default function LivePage() {
  redirect("/");
}
