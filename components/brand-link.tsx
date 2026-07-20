import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";

/** The Printa wordmark used in the landing navbar — reused across the editors. */
export function BrandLink({ className }: { className?: string }) {
  return (
    <Link href="/" aria-label="Printa home" className={cn("flex items-center gap-2", className)}>
      <Image src="/printa-logo.png" alt="" width={26} height={26} className="rounded-md" priority />
      <span className="text-[15px] font-semibold tracking-tight text-foreground">Printa</span>
    </Link>
  );
}
