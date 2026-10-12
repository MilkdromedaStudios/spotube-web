import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center gap-4 p-16 text-center">
      <h1 className="text-3xl font-bold">Page not found</h1>
      <p className="text-muted">That page doesn&apos;t exist in Spotube Web.</p>
      <Link href="/" className="rounded-full bg-accent px-5 py-2 font-medium text-accent-fg">
        Go home
      </Link>
    </div>
  );
}
