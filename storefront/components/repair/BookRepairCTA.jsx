"use client";

import { useState } from "react";
import { CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";

// Self-contained "Book a Repair" button + modal, ported from the BookingModal
// in frontend/src/pages/RepairServices.jsx. Submission is local-only (the
// legacy modal also just showed a confirmation); wiring to the repairs API is
// a later phase.
export default function BookRepairCTA({
  label = "Book a Repair",
  size = "default",
  variant = "default",
  className,
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", device: "", issue: "" });
  const [submitted, setSubmitted] = useState(false);

  const close = () => {
    setOpen(false);
    setSubmitted(false);
    setForm({ name: "", phone: "", device: "", issue: "" });
  };

  return (
    <>
      <Button size={size} variant={variant} className={className} onClick={() => setOpen(true)} type="button">
        {label}
      </Button>

      {open && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={close}>
          <div className="bg-background rounded-xl p-6 max-w-md w-full shadow-xl" onClick={(e) => e.stopPropagation()}>
            {submitted ? (
              <div className="text-center py-2">
                <CheckCircle className="h-14 w-14 text-green-500 mx-auto mb-4" />
                <h3 className="text-xl font-bold mb-2">Request Received!</h3>
                <p className="text-muted-foreground text-sm mb-6">
                  We&apos;ll contact you within 30 minutes to confirm your appointment.
                </p>
                <Button onClick={close} className="w-full">Done</Button>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold">Book a Repair</h3>
                  <button onClick={close} aria-label="Close" className="text-muted-foreground hover:text-foreground text-xl leading-none">
                    ×
                  </button>
                </div>
                <form onSubmit={(e) => { e.preventDefault(); setSubmitted(true); }} className="space-y-4">
                  <div>
                    <label className="text-sm font-medium mb-1 block">Full Name</label>
                    <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Your name" className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1 block">Phone Number</label>
                    <input required type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="017XXXXXXXX" className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1 block">Device (e.g. MacBook Pro 2021)</label>
                    <input required value={form.device} onChange={(e) => setForm({ ...form, device: e.target.value })} placeholder="Make & Model" className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1 block">Describe the Issue</label>
                    <textarea required value={form.issue} onChange={(e) => setForm({ ...form, issue: e.target.value })} rows={3} placeholder="Screen cracked, won't power on..." className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none" />
                  </div>
                  <Button type="submit" className="w-full">Submit Request</Button>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
