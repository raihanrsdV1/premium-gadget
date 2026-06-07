"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";

// Newsletter signup. The legacy form had no submit handler (a bare <form> that
// reloads the page); here we prevent the reload and show a simple confirmation.
export default function NewsletterForm() {
  const [done, setDone] = useState(false);

  const onSubmit = (e) => {
    e.preventDefault();
    setDone(true);
  };

  if (done) {
    return (
      <p className="font-medium" role="status">
        🎉 Thanks for subscribing! Check your inbox for a confirmation.
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto">
      <input
        type="email"
        placeholder="Enter your email address"
        className="flex h-12 w-full rounded-md border-transparent bg-primary-foreground/10 px-4 py-2 text-sm text-primary-foreground placeholder:text-primary-foreground/70 focus:outline-none focus:ring-2 focus:ring-primary-foreground/50 transition-colors"
        required
      />
      <Button type="submit" variant="secondary" className="h-12 px-8 shrink-0 font-bold">
        Subscribe
      </Button>
    </form>
  );
}
