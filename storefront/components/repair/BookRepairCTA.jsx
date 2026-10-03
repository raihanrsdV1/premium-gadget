"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertCircle, CheckCircle, Loader2, X } from "lucide-react";
import { Button, buttonClass } from "@/components/ui/Button";
import { useModalA11y } from "@/hooks/useModalA11y";
import { createRepairTicket } from "@/lib/api/repairs";

const field =
  "h-11 w-full rounded-xl border border-input bg-background px-4 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const EMPTY = { name: "", phone: "", device: "", issue: "" };

function BookingDialog({ onClose }) {
  const ref = useModalA11y(true, onClose);
  const [form, setForm] = useState(EMPTY);
  const [ticket, setTicket] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const t = await createRepairTicket({
        customer_name: form.name.trim(),
        customer_phone: form.phone.trim(),
        device_type: form.device.trim(),
        issue_description: form.issue.trim(),
      });
      setTicket(t);
    } catch (err) {
      const first = err.data?.errors?.[0]?.message;
      setError(first || err.data?.message || "We couldn't send your request. Please try again or call us.");
    } finally {
      setSubmitting(false);
    }
  };

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-navy/60 p-0 backdrop-blur-[2px] sm:items-center sm:p-4" onClick={onClose}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label="Book a repair"
        className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-background p-6 shadow-float sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        {ticket ? (
          <div className="py-2 text-center">
            <CheckCircle className="mx-auto mb-4 h-14 w-14 text-success" aria-hidden="true" />
            <h2 className="mb-2 font-display text-xl font-extrabold">Request received</h2>
            <p className="mb-1 text-sm text-muted-foreground">Your ticket number is</p>
            <p className="mb-3 font-display text-2xl font-extrabold text-primary">{ticket.ticket_number}</p>
            <p className="mb-6 text-sm text-muted-foreground">
              Keep it to track progress. {ticket.branch?.name ? `Drop the device at ${ticket.branch.name}; ` : ""}we will contact you to confirm.
            </p>
            <div className="flex gap-3">
              <Link href="/repairs/track" className={buttonClass({ variant: "outline", className: "flex-1" })}>Track repair</Link>
              <Button onClick={onClose} className="flex-1">Done</Button>
            </div>
          </div>
        ) : (
          <>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-xl font-extrabold">Book a repair</h2>
              <button type="button" onClick={onClose} aria-label="Close" className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-accent">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={submit} className="space-y-4">
              <div>
                <label htmlFor="rp-name" className="mb-1.5 block text-sm font-bold">Full name</label>
                <input id="rp-name" required minLength={2} autoComplete="name" value={form.name} onChange={set("name")} placeholder="Your name" className={field} />
              </div>
              <div>
                <label htmlFor="rp-phone" className="mb-1.5 block text-sm font-bold">Phone number</label>
                <input id="rp-phone" required type="tel" autoComplete="tel" value={form.phone} onChange={set("phone")} placeholder="017XXXXXXXX" className={field} />
              </div>
              <div>
                <label htmlFor="rp-device" className="mb-1.5 block text-sm font-bold">Device</label>
                <input id="rp-device" required value={form.device} onChange={set("device")} placeholder="e.g. MacBook Pro 2021" className={field} />
              </div>
              <div>
                <label htmlFor="rp-issue" className="mb-1.5 block text-sm font-bold">Describe the issue</label>
                <textarea id="rp-issue" required minLength={10} value={form.issue} onChange={set("issue")} rows={3} placeholder="Screen cracked, won't power on..." className="w-full resize-none rounded-xl border border-input bg-background px-4 py-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
              </div>
              {error && (
                <p role="alert" className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> {error}
                </p>
              )}
              <Button type="submit" size="lg" className="w-full" disabled={submitting}>
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />} Submit request
              </Button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

// Self-contained "Book a Repair" button + dialog. Submits a real ticket to
// POST /repairs/tickets and shows the ticket number to track it with.
export default function BookRepairCTA({ label = "Book a Repair", size = "default", variant = "default", className }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size={size} variant={variant} className={className} onClick={() => setOpen(true)} type="button" aria-haspopup="dialog">
        {label}
      </Button>
      {open && <BookingDialog onClose={() => setOpen(false)} />}
    </>
  );
}
