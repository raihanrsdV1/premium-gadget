import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Card, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import {
  PenTool, CheckCircle, Clock, Cpu, Monitor, Battery, HardDrive,
  Wifi, Wrench, ChevronRight, Phone, MapPin, ArrowRight,
} from 'lucide-react';

const SERVICES = [
  {
    icon: Monitor,
    title: 'Screen Replacement',
    description: 'Cracked or dead screen? We replace displays for MacBook, Dell, HP, Lenovo and more.',
    price: 'From ৳3,500',
    turnaround: '1–2 days',
  },
  {
    icon: Battery,
    title: 'Battery Replacement',
    description: 'Restore full battery capacity with genuine or high-quality replacement cells.',
    price: 'From ৳2,000',
    turnaround: 'Same day',
  },
  {
    icon: HardDrive,
    title: 'SSD / RAM Upgrade',
    description: 'Speed up your laptop with a fast NVMe SSD or expanded RAM.',
    price: 'From ৳500',
    turnaround: 'Same day',
  },
  {
    icon: Cpu,
    title: 'Motherboard Repair',
    description: 'Expert micro-soldering for power issues, GPU failures, and component-level faults.',
    price: 'From ৳5,000',
    turnaround: '3–7 days',
  },
  {
    icon: Wifi,
    title: 'Keyboard & Trackpad',
    description: 'Sticky keys, dead trackpad, or liquid damage — we fix them all.',
    price: 'From ৳2,500',
    turnaround: '1–3 days',
  },
  {
    icon: Wrench,
    title: 'Full Diagnostic',
    description: "Not sure what's wrong? Bring it in for a comprehensive hardware & software check.",
    price: '৳500',
    turnaround: 'Same day',
  },
];

const PROCESS_STEPS = [
  { step: '01', title: 'Drop Off', desc: 'Bring your device to any branch or book a courier pickup.' },
  { step: '02', title: 'Diagnose', desc: 'Our technician examines the device and sends you a quote.' },
  { step: '03', title: 'Repair', desc: 'Once approved, we carry out the repair with quality parts.' },
  { step: '04', title: 'Collect', desc: 'Pick up your repaired device or get it delivered to your door.' },
];

const BookingModal = ({ onClose }) => {
  const [form, setForm] = useState({ name: '', phone: '', device: '', issue: '' });
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-background rounded-xl p-8 max-w-sm w-full text-center shadow-xl">
          <CheckCircle className="h-14 w-14 text-green-500 mx-auto mb-4" />
          <h3 className="text-xl font-bold mb-2">Request Received!</h3>
          <p className="text-muted-foreground text-sm mb-6">We'll contact you within 30 minutes to confirm your appointment.</p>
          <Button onClick={onClose} className="w-full">Done</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-background rounded-xl p-6 max-w-md w-full shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold">Book a Repair</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-xl leading-none">×</button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
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
      </div>
    </div>
  );
};

const RepairServices = () => {
  const [showModal, setShowModal] = useState(false);
  const navigate = useNavigate();

  return (
    <div className="px-4">
      {showModal && <BookingModal onClose={() => setShowModal(false)} />}

      {/* Hero */}
      <section className="bg-gradient-to-br from-slate-900 to-slate-800 text-white py-20 px-4 -mx-4 mb-16">
        <div className="container text-center max-w-3xl mx-auto">
          <span className="inline-block bg-primary/20 text-primary-foreground text-sm font-semibold px-3 py-1 rounded-full mb-4">
            Certified Repair Center
          </span>
          <h1 className="text-4xl md:text-5xl font-bold mb-5 tracking-tight">
            Expert Gadget Repair
          </h1>
          <p className="text-slate-300 text-lg mb-8 max-w-xl mx-auto">
            From screen replacements to complex motherboard micro-soldering, our certified technicians bring your devices back to life.
          </p>
          <div className="flex flex-wrap gap-3 justify-center">
            <Button size="lg" onClick={() => setShowModal(true)}>
              Book a Repair
            </Button>
            <Button size="lg" variant="outline" className="border-white/30 text-white hover:bg-white/10" onClick={() => navigate('/repairs/track')}>
              Track My Repair
            </Button>
          </div>
        </div>
      </section>

      {/* Services grid */}
      <section className="container mb-20">
        <div className="text-center mb-10">
          <h2 className="text-3xl font-bold mb-2">Our Services</h2>
          <p className="text-muted-foreground">Transparent pricing, genuine parts, 90-day warranty on all repairs.</p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {SERVICES.map((svc) => (
            <Card key={svc.title} className="hover:shadow-md transition-shadow">
              <CardContent className="p-6">
                <div className="w-12 h-12 bg-primary/10 text-primary rounded-xl flex items-center justify-center mb-4">
                  <svc.icon className="h-6 w-6" />
                </div>
                <h3 className="font-bold text-lg mb-2">{svc.title}</h3>
                <p className="text-muted-foreground text-sm mb-4 leading-relaxed">{svc.description}</p>
                <div className="flex items-center justify-between text-sm">
                  <span className="font-semibold text-primary">{svc.price}</span>
                  <span className="text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" /> {svc.turnaround}
                  </span>
                </div>
                <Button variant="outline" size="sm" className="w-full mt-4" onClick={() => setShowModal(true)}>
                  Book Now
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="container mb-20">
        <div className="text-center mb-10">
          <h2 className="text-3xl font-bold mb-2">How It Works</h2>
          <p className="text-muted-foreground">Simple, transparent process from drop-off to pick-up.</p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {PROCESS_STEPS.map((step, i) => (
            <div key={step.step} className="relative text-center">
              {i < PROCESS_STEPS.length - 1 && (
                <ChevronRight className="hidden lg:block absolute -right-3 top-6 h-6 w-6 text-muted-foreground/40 z-10" />
              )}
              <div className="w-14 h-14 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xl font-bold mx-auto mb-3">
                {step.step}
              </div>
              <h3 className="font-semibold mb-1">{step.title}</h3>
              <p className="text-muted-foreground text-sm">{step.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Track repair CTA */}
      <section className="container mb-20">
        <div className="bg-slate-900 dark:bg-slate-950 rounded-2xl p-8 md:p-12 text-white flex flex-col md:flex-row items-center justify-between gap-6">
          <div>
            <h3 className="text-2xl font-bold mb-2">Already dropped off your device?</h3>
            <p className="text-slate-300">Track your repair status in real time with your ticket number.</p>
          </div>
          <Link to="/repairs/track">
            <Button size="lg" variant="outline" className="border-white/30 text-white hover:bg-white/10 whitespace-nowrap">
              Track Repair Status <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
        </div>
      </section>

      {/* Contact info */}
      <section className="container mb-20">
        <div className="grid sm:grid-cols-2 gap-6 max-w-2xl mx-auto">
          <Card className="p-5">
            <CardContent className="p-0 flex items-start gap-4">
              <Phone className="h-6 w-6 text-primary shrink-0 mt-0.5" />
              <div>
                <h4 className="font-semibold mb-1">Call Us</h4>
                <p className="text-muted-foreground text-sm">01700-000000</p>
                <p className="text-muted-foreground text-sm">Sat–Thu, 10am–8pm</p>
              </div>
            </CardContent>
          </Card>
          <Card className="p-5">
            <CardContent className="p-0 flex items-start gap-4">
              <MapPin className="h-6 w-6 text-primary shrink-0 mt-0.5" />
              <div>
                <h4 className="font-semibold mb-1">Visit Us</h4>
                <p className="text-muted-foreground text-sm">Level 4, Multiplan Center</p>
                <p className="text-muted-foreground text-sm">New Elephant Road, Dhaka</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
};

export default RepairServices;
