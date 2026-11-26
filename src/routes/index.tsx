import { createFileRoute } from "@tanstack/react-router";
import { useState, useRef, useEffect } from "react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "The Beauty Vault — VaultBot Beauty Concierge" },
      { name: "description", content: "Chat with VaultBot to explore services and book salon appointments in Cape Town, Johannesburg and Durban." },
      { property: "og:title", content: "The Beauty Vault — VaultBot" },
      { property: "og:description", content: "Your Beauty. Your Time. Your Vault." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

const SERVICES: Record<string, string[]> = {
  "Beauty Studio": ["Hair styling — R450", "Braiding — R650", "Gel nails — R320", "Eyelash extensions — R550", "Eyebrow lamination — R380"],
  "Wellness Clinic": ["Pedicure — R300", "Facial — R520", "Massage (60 min) — R600", "Body wrap — R480", "Waxing — from R150"],
  "Grooming Lounge": ["Men's haircut — R180", "Fade — R220", "Beard trim — R120", "Dreadlock maintenance — R400"],
  "Beauty Boutique": ["Human-hair wigs", "Hair care products", "Nail care kits", "Skincare"],
};
const BRANCHES = ["Cape Town", "Johannesburg", "Durban"];
const TIMES = ["09:00", "10:30", "12:00", "14:00", "15:30"];

type Msg = { from: "bot" | "me"; text: string; chips?: string[] };
type Draft = { service?: string; branch?: string; date?: string; time?: string; name?: string; step?: string };

function Index() {
  const [msgs, setMsgs] = useState<Msg[]>([
    { from: "bot", text: "Welcome to The Beauty Vault ✨ I'm VaultBot, your beauty concierge. How can I help? (Demo business data)", chips: ["Book appointment", "View services", "My bookings", "Opening hours"] },
  ]);
  const [input, setInput] = useState("");
  const [draft, setDraft] = useState<Draft>({});
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => end.current?.scrollIntoView({ behavior: "smooth" }), [msgs]);

  const bot = (text: string, chips?: string[]) => setMsgs((m) => [...m, { from: "bot", text, ...(chips ? { chips } : {}) }]);

  function handle(raw: string) {
    const t = raw.trim();
    if (!t) return;
    setMsgs((m) => [...m, { from: "me", text: t }]);
    setInput("");
    const l = t.toLowerCase();
    const d = { ...draft };
    setTimeout(() => {
      if (d.step === "service") { d.service = t; d.step = "branch"; setDraft(d); return bot("Which branch?", BRANCHES); }
      if (d.step === "branch") { d.branch = t; d.step = "date"; setDraft(d); return bot("Which day?", ["Today", "Tomorrow", "Saturday"]); }
      if (d.step === "date") { d.date = t; d.step = "time"; setDraft(d); return bot(`Available times on ${t}:`, TIMES); }
      if (d.step === "time") { d.time = t; d.step = "name"; setDraft(d); return bot("Lovely. What name should I book under?"); }
      if (d.step === "name") {
        const b = { ...d, name: t };
        const list = JSON.parse(localStorage.getItem("vault-bookings") || "[]");
        list.push(b); localStorage.setItem("vault-bookings", JSON.stringify(list));
        setDraft({});
        return bot(`Booked ✅ ${b.service} at ${b.branch}, ${b.date} ${b.time}, for ${t}. A 20% deposit secures your slot.`, ["My bookings", "Book appointment"]);
      }
      if (l.includes("book")) { setDraft({ step: "service" }); return bot("Which service would you like?", Object.values(SERVICES).flat().slice(0, 8).map((s) => s.split(" — ")[0]!)); }
      if (l.includes("service") || l.includes("price")) return bot(Object.entries(SERVICES).map(([k, v]) => `${k}: ${v.join(", ")}`).join("\n\n"), ["Book appointment"]);
      if (l.includes("my booking") || l.includes("cancel")) {
        const list: Draft[] = JSON.parse(localStorage.getItem("vault-bookings") || "[]");
        if (l.includes("cancel")) { localStorage.removeItem("vault-bookings"); return bot("All your bookings have been cancelled.", ["Book appointment"]); }
        return bot(list.length ? list.map((b) => `• ${b.service} — ${b.branch}, ${b.date} ${b.time}`).join("\n") : "You have no bookings yet.", list.length ? ["Cancel bookings", "Book appointment"] : ["Book appointment"]);
      }
      if (l.includes("hour") || l.includes("open")) return bot("Mon–Fri 08:00–19:00, Sat 08:00–17:00, Sun 09:00–14:00 at all branches.");
      if (l.includes("deposit") || l.includes("pay")) return bot("We take a 20% deposit via card or EFT; the balance is paid in salon.");
      bot("I can help with bookings, services, prices, hours and deposits.", ["Book appointment", "View services", "My bookings"]);
    }, 350);
  }

  return (
    <main className="min-h-screen bg-background flex flex-col items-center">
      <header className="w-full max-w-2xl px-5 pt-8 pb-4 text-center">
        <h1 className="font-display text-4xl tracking-wide text-foreground">The Beauty Vault</h1>
        <p className="mt-1 text-sm tracking-[0.2em] uppercase text-primary">Your Beauty. Your Time. Your Vault.</p>
      </header>
      <section className="flex-1 w-full max-w-2xl flex flex-col bg-card border border-border sm:rounded-2xl shadow-[var(--shadow-soft)] overflow-hidden sm:mb-8">
        <div className="px-5 py-3 border-b border-border flex items-center gap-3">
          <div className="h-9 w-9 rounded-full bg-primary text-primary-foreground grid place-items-center font-display">V</div>
          <div><p className="font-medium text-foreground">VaultBot</p><p className="text-xs text-muted-foreground">Your Virtual Beauty Concierge</p></div>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-4 min-h-[60vh]">
          {msgs.map((m, i) => (
            <div key={i} className={m.from === "me" ? "flex justify-end" : ""}>
              <div className={`whitespace-pre-line max-w-[85%] text-sm leading-relaxed ${m.from === "me" ? "bg-foreground text-background rounded-2xl rounded-br-sm px-4 py-2" : "text-foreground"}`}>{m.text}</div>
              {m.chips && i === msgs.length - 1 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {m.chips.map((c) => <button key={c} onClick={() => handle(c)} className="text-xs px-3 py-1.5 rounded-full border border-primary text-foreground hover:bg-secondary transition">{c}</button>)}
                </div>
              )}
            </div>
          ))}
          <div ref={end} />
        </div>
        <form onSubmit={(e) => { e.preventDefault(); handle(input); }} className="p-3 border-t border-border flex gap-2">
          <input autoFocus value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask VaultBot…" className="flex-1 bg-muted rounded-full px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" />
          <button className="rounded-full bg-primary text-primary-foreground px-5 text-sm font-medium">Send</button>
        </form>
      </section>
    </main>
  );
}
