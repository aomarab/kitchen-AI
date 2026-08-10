import { AuthBrand } from '../../components/auth/AuthBrand';
import { AuthHero } from '../../components/auth/AuthHero';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      {/* The band and the sheet that overlaps it: `-mt-16` pulls the card up
          over the navy, and the band's `pb-24` reserves the room it takes. */}
      <div className="bg-inverse">
        <AuthBrand />
        <AuthHero />
      </div>
      <main id="main" className="-mt-16 flex flex-1 justify-center px-4 pb-10">
        <div className="h-fit w-full max-w-md rounded-2xl border border-border bg-background p-6 shadow-[0_5px_20px_rgba(0,0,0,0.1)] sm:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
