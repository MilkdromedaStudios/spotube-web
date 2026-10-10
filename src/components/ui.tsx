"use client";

import clsx from "clsx";
import { Loader2, AlertTriangle, X } from "lucide-react";
import {
  forwardRef,
  useEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "outline";

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" }>(
  function Button({ variant = "secondary", size = "md", className, ...props }, ref) {
    return (
      <button
        ref={ref}
        {...props}
        className={clsx(
          "inline-flex items-center justify-center gap-2 rounded-full font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
          size === "sm" ? "h-8 px-3 text-sm" : "h-10 px-4 text-sm",
          variant === "primary" && "bg-accent text-accent-fg hover:brightness-110",
          variant === "secondary" && "bg-surface-3 text-fg hover:bg-surface-3/80",
          variant === "ghost" && "text-muted hover:bg-surface-2 hover:text-fg",
          variant === "outline" && "border border-line text-fg hover:bg-surface-2",
          variant === "danger" && "bg-danger/15 text-danger hover:bg-danger/25",
          className,
        )}
      />
    );
  },
);

export const IconButton = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { label: string; active?: boolean; size?: "sm" | "md" | "lg" }
>(function IconButton({ label, active, size = "md", className, children, ...props }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      title={label}
      {...props}
      className={clsx(
        "inline-flex shrink-0 items-center justify-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-40",
        size === "sm" && "size-8",
        size === "md" && "size-9",
        size === "lg" && "size-12",
        active ? "text-accent" : "text-muted hover:text-fg",
        "hover:bg-surface-2",
        className,
      )}
    >
      {children}
    </button>
  );
});

export function Spinner({ className, label = "Loading" }: { className?: string; label?: string }) {
  return <Loader2 aria-label={label} role="status" className={clsx("animate-spin", className ?? "size-5")} />;
}

export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 py-10 text-muted" role="status">
      <Spinner />
      <span>{label}</span>
    </div>
  );
}

export function EmptyState({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-line px-6 py-12 text-center">
      {icon && <div className="text-subtle">{icon}</div>}
      <h3 className="text-lg font-semibold">{title}</h3>
      {children && <div className="max-w-md text-sm text-muted">{children}</div>}
      {action}
    </div>
  );
}

export function ErrorState({ title = "Something went wrong", message, onRetry }: { title?: string; message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex items-start gap-3 rounded-2xl border border-danger/30 bg-danger/10 p-4">
      <AlertTriangle className="mt-0.5 size-5 shrink-0 text-danger" />
      <div className="flex-1">
        <p className="font-medium">{title}</p>
        <p className="text-sm text-muted">{message}</p>
      </div>
      {onRetry && (
        <Button size="sm" variant="outline" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  );
}

export function Notice({ children, tone = "info" }: { children: ReactNode; tone?: "info" | "warn" }) {
  return (
    <div
      className={clsx(
        "rounded-xl border p-3 text-sm",
        tone === "warn" ? "border-yellow-500/30 bg-yellow-500/10 text-fg" : "border-line bg-surface-2 text-muted",
      )}
    >
      {children}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx("animate-pulse rounded-md bg-surface-2", className)} />;
}

export function Dialog({
  open,
  onClose,
  title,
  children,
  footer,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const first = ref.current?.querySelector<HTMLElement>("input, textarea, button:not([data-close])");
    first?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      prev?.focus?.();
    };
  }, [open, onClose]);
  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4" onMouseDown={onClose}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(e) => e.stopPropagation()}
        className={clsx(
          "flex max-h-[90dvh] w-full flex-col rounded-t-2xl border border-line bg-surface shadow-2xl sm:rounded-2xl",
          wide ? "sm:max-w-2xl" : "sm:max-w-md",
        )}
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <h2 className="text-lg font-semibold">{title}</h2>
          <IconButton label="Close" data-close onClick={onClose}>
            <X className="size-5" />
          </IconButton>
        </div>
        <div className="scrollbar-thin overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export interface MenuItem {
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
}

/** Small popover menu anchored to a trigger button. */
export function Menu({ trigger, items, label }: { trigger: ReactNode; items: (MenuItem | null | false)[]; label: string }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; up: boolean }>({ top: 0, left: 0, up: false });
  const btn = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (menu.current?.contains(e.target as Node) || btn.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", () => setOpen(false), { once: true });
    menu.current?.querySelector<HTMLElement>("button")?.focus();
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  const toggle = () => {
    const r = btn.current!.getBoundingClientRect();
    const up = r.bottom > window.innerHeight * 0.6;
    setPos({ top: up ? r.top : r.bottom, left: Math.min(r.right, window.innerWidth - 8), up });
    setOpen((o) => !o);
  };
  const list = items.filter(Boolean) as MenuItem[];
  return (
    <>
      <button
        ref={btn}
        type="button"
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          toggle();
        }}
        className="inline-flex size-8 items-center justify-center rounded-full text-muted hover:bg-surface-3 hover:text-fg"
      >
        {trigger}
      </button>
      {open &&
        createPortal(
          <div
            ref={menu}
            role="menu"
            style={{
              top: pos.up ? undefined : pos.top + 4,
              bottom: pos.up ? window.innerHeight - pos.top + 4 : undefined,
              left: pos.left,
            }}
            className="fixed z-[90] min-w-52 -translate-x-full rounded-xl border border-line bg-surface-2 p-1 shadow-2xl"
            onKeyDown={(e) => {
              const buttons = [...(menu.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [])];
              const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
              if (e.key === "ArrowDown") (buttons[i + 1] ?? buttons[0])?.focus();
              if (e.key === "ArrowUp") (buttons[i - 1] ?? buttons[buttons.length - 1])?.focus();
            }}
          >
            {list.map((item) => (
              <button
                key={item.label}
                role="menuitem"
                disabled={item.disabled}
                onClick={(e) => {
                  e.stopPropagation();
                  setOpen(false);
                  item.onSelect();
                }}
                className={clsx(
                  "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-surface-3 disabled:opacity-40",
                  item.danger ? "text-danger" : "text-fg",
                )}
              >
                {item.icon && <span className="text-muted [&>svg]:size-4">{item.icon}</span>}
                {item.label}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}

export function Toggle({ checked, onChange, label, description, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: ReactNode; disabled?: boolean }) {
  return (
    <label className={clsx("flex items-start justify-between gap-4 py-3", disabled && "opacity-50")}>
      <span>
        <span className="block text-sm font-medium">{label}</span>
        {description && <span className="block text-sm text-muted">{description}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={clsx(
          "relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors",
          checked ? "bg-accent" : "bg-surface-3",
        )}
      >
        <span className={clsx("absolute top-0.5 size-5 rounded-full bg-white shadow transition-all", checked ? "left-[22px]" : "left-0.5")} />
      </button>
    </label>
  );
}
