import { BOLT_PATH } from "@/components/logo";

interface Props {
  title: string;
  text: string;
  action?: { label: string; href: string };
}

export function EmptyState({ title, text, action }: Props) {
  return (
    <div className="card mx-auto mt-10 max-w-md px-6 py-12 text-center">
      <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-emerald-50">
        <svg viewBox="0 0 32 32" className="h-5 w-5">
          <path d={BOLT_PATH} fill="#059669" />
        </svg>
      </div>
      <h2 className="mt-4 text-base font-semibold tracking-tight text-zinc-900">
        {title}
      </h2>
      <p className="mt-1.5 text-sm leading-relaxed text-zinc-500">{text}</p>
      {action && (
        <a href={action.href} className="btn btn-primary mt-6">
          {action.label}
        </a>
      )}
    </div>
  );
}
