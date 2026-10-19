import { Basketball } from "./icons";

export function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <main className="flex flex-1 flex-col items-center px-4 pt-16 pb-10 sm:justify-center sm:pt-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <span className="mb-4 flex h-16 w-16 items-center justify-center rounded-[16px] bg-ball text-white shadow-sm">
            <Basketball className="h-9 w-9" />
          </span>
          <h1 className="text-[28px] font-bold leading-tight">{title}</h1>
          <p className="mt-1.5 text-[15px] text-muted">{subtitle}</p>
        </div>
        {children}
      </div>
    </main>
  );
}
