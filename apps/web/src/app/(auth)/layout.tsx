import { AuthBrand } from '../../components/auth/AuthBrand';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-canvas-lavender">
      <AuthBrand />
      <main id="main" className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-md rounded-2xl border border-border bg-background p-6 shadow-[0_5px_20px_rgba(0,0,0,0.1)] sm:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
