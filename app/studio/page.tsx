import { redirect } from "next/navigation";

export default async function StudioPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const incoming = await searchParams;
  const params = new URLSearchParams({ mode: "procedural" });
  for (const [key, value] of Object.entries(incoming)) {
    if (key === "mode" || value === undefined) continue;
    if (Array.isArray(value)) value.forEach((item) => params.append(key, item));
    else params.set(key, value);
  }
  redirect(`/editor?${params.toString()}`);
}
