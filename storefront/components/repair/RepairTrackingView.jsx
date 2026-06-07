"use client";

import { useState } from "react";
import { Search, CheckCircle, Clock, Wrench, Package, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { trackRepair } from "@/lib/api/repairs";

const TIMELINE_STEPS = ["Received", "Diagnosing", "Repairing", "Ready", "Delivered"];

// Map the backend repair_status enum to a timeline step index.
const STATUS_MAP = {
  pending: 0,
  diagnosed: 1,
  awaiting_parts: 2,
  repairing: 2,
  ready: 3,
  delivered: 4,
};

// Ported from frontend/src/pages/RepairTracking.jsx, wired to the real
// /repairs/track endpoint (ticket_number + registered phone).
export default function RepairTrackingView() {
  const [ticketNumber, setTicketNumber] = useState("");
  const [phone, setPhone] = useState("");
  const [ticket, setTicket] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleTrack = async (e) => {
    e.preventDefault();
    setError("");
    setTicket(null);
    setLoading(true);
    try {
      const data = await trackRepair(ticketNumber.trim(), phone.trim());
      setTicket(data);
    } catch (err) {
      setError(err.data?.message || "No ticket found with that number and phone combination.");
    } finally {
      setLoading(false);
    }
  };

  const currentStep = ticket ? STATUS_MAP[ticket.status] ?? 0 : -1;
  const isCancelled = ticket?.status === "cancelled";

  return (
    <div className="container py-12 px-4 max-w-2xl mx-auto">
      <div className="text-center mb-10">
        <h1 className="text-3xl font-bold tracking-tight mb-2">Track Your Repair</h1>
        <p className="text-muted-foreground">Enter your ticket number and registered phone to see real-time status.</p>
      </div>

      <Card className="mb-8">
        <CardContent className="p-6">
          <form onSubmit={handleTrack} className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1.5 block">Ticket Number</label>
              <input
                required
                value={ticketNumber}
                onChange={(e) => setTicketNumber(e.target.value)}
                placeholder="e.g. RPR-1234"
                className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Registered Phone</label>
              <input
                required
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="017XXXXXXXX"
                className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
              Track Status
            </Button>
          </form>

          {error && (
            <div className="mt-4 flex items-center gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-md px-3 py-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}
        </CardContent>
      </Card>

      {ticket && (
        <div className="space-y-6">
          {/* Timeline (hidden for cancelled) */}
          {!isCancelled && (
            <Card>
              <CardContent className="p-6">
                <h2 className="font-semibold text-lg mb-6">Repair Progress</h2>
                <div className="relative">
                  <div className="absolute top-4 left-4 right-4 h-0.5 bg-muted" />
                  <div
                    className="absolute top-4 left-4 h-0.5 bg-primary transition-all duration-500"
                    style={{ width: `${(currentStep / (TIMELINE_STEPS.length - 1)) * 100}%` }}
                  />
                  <div className="relative flex justify-between">
                    {TIMELINE_STEPS.map((step, i) => {
                      const done = i <= currentStep;
                      const active = i === currentStep;
                      return (
                        <div key={step} className="flex flex-col items-center gap-2">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 z-10 transition-colors ${done ? "bg-primary border-primary text-primary-foreground" : "bg-background border-muted-foreground/30 text-muted-foreground"} ${active ? "ring-2 ring-primary ring-offset-2" : ""}`}>
                            {done ? <CheckCircle className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
                          </div>
                          <span className={`text-xs font-medium text-center ${done ? "text-primary" : "text-muted-foreground"}`}>{step}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Details */}
          <Card>
            <CardContent className="p-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h2 className="font-semibold text-lg">{ticket.ticket_number}</h2>
                  <p className="text-sm text-muted-foreground">
                    Received: {ticket.received_at ? new Date(ticket.received_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—"}
                  </p>
                </div>
                <span className={`text-xs font-semibold px-3 py-1 rounded-full capitalize ${isCancelled ? "bg-red-100 text-red-700" : "bg-blue-100 text-blue-700"}`}>
                  {ticket.status?.replace("_", " ")}
                </span>
              </div>
              <div className="space-y-3 text-sm">
                <div className="flex gap-3">
                  <Package className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                  <div>
                    <p className="font-medium">
                      {[ticket.device_brand, ticket.device_model].filter(Boolean).join(" ") || ticket.device_type}
                    </p>
                    <p className="text-muted-foreground">{ticket.issue_description}</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <Wrench className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                  <div>
                    <p className="font-medium">Technician: {ticket.assigned_technician || "To be assigned"}</p>
                    {ticket.estimated_completion && (
                      <p className="text-muted-foreground">
                        Est. completion: {new Date(ticket.estimated_completion).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                      </p>
                    )}
                    {ticket.branch_name && <p className="text-muted-foreground">Branch: {ticket.branch_name}</p>}
                  </div>
                </div>
                {ticket.diagnosis_notes && (
                  <div className="bg-slate-50 dark:bg-slate-900 rounded-lg p-3 mt-3">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Technician Notes</p>
                    <p className="text-sm">{ticket.diagnosis_notes}</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
