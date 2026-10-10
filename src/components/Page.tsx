import clsx from "clsx";
import type { ReactNode } from "react";

export function Page({ title, children, actions, className }: { title?: string; children: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <div className={clsx("mx-auto flex w-full max-w-[1600px] flex-col gap-8 px-4 py-6 md:px-6", className)}>
      {title && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
          {actions}
        </div>
      )}
      {children}
    </div>
  );
}
