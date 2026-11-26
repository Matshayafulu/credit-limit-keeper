import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/services")({
  head: () => ({
    meta: [
      { title: "Services & Packages — The Beauty Vault" },
      { name: "description", content: "Beauty Studio, Wellness Clinic, Grooming Lounge and Boutique services and signature packages." },
      { property: "og:title", content: "Services & Packages — The Beauty Vault" },
      { property: "og:description", content: "Explore every service, then book with VaultBot." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Services,
});

const DIV: [string, string[]][] = [
  ["Beauty Studio", ["Hair styling — R450", "Braiding — R650", "Wig & weave installs — R700", "Gel nails — R320", "Acrylic nails — R380", "Nail art — from R80", "Eyebrow shaping & tint — R150", "Eyebrow lamination — R380", "Eyelash extensions — R550"]],
  ["Wellness Clinic", ["Pedicure — R300", "Foot therapy & reflexology — R350", "Facial — R520", "Massage (60 min) — R600", "Body exfoliation — R420", "Body wrap — R480", "Waxing — from R150"]],
  ["Grooming Lounge", ["Men's haircut — R180", "Fade / taper — R220", "Beard trim & conditioning — R120", "Dreadlock maintenance — R400", "Grey blending — R250"]],
  ["Beauty Boutique", ["Human-hair wigs — from R1,200", "Hair care — from R150", "Nail care kits — R250", "Skincare — from R180"]],
  ["Signature Packages", ["Bridal Glow — R1,800", "Vault Pamper Day — R1,400", "Gentleman's Reset — R550"]],
];

function Services() {
  return (
    <main className="min-h-screen bg-background px-5 py-10">
      <div className="mx-auto max-w-4xl">
        <Link to="/" className="text-sm text-primary">← Back to VaultBot</Link>
        <h1 className="mt-4 font-display text-4xl text-foreground">Services & Packages</h1>
        <p className="mt-2 text-sm text-muted-foreground">Demo prices. Cape Town · Johannesburg · Durban.</p>
        <div className="mt-8 grid gap-5 sm:grid-cols-2">
          {DIV.map(([name, items]) => (
            <section key={name} className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-soft)]">
              <h2 className="font-display text-2xl text-foreground">{name}</h2>
              <ul className="mt-3 space-y-1.5 text-sm text-muted-foreground">{items.map((i) => <li key={i}>{i}</li>)}</ul>
            </section>
          ))}
        </div>
        <section className="mt-10 rounded-2xl border border-border bg-card p-6">
          <h2 className="font-display text-2xl text-foreground">Visit us</h2>
          <p className="mt-2 text-sm text-muted-foreground">Mon–Fri 08:00–19:00 · Sat 08:00–17:00 · Sun 09:00–14:00. R100 deposit secures bookings; refundable 24h before. Earn Vault loyalty points on every visit.</p>
          <Link to="/" className="mt-4 inline-block rounded-full bg-primary px-5 py-2 text-sm font-medium text-primary-foreground">Book with VaultBot</Link>
        </section>
      </div>
    </main>
  );
}
