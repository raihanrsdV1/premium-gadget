import * as React from "react";
import { cn } from "@/lib/utils";

// Pill buttons, direction B. `coral` is the call-to-action colour, `default`
// royal blue, `navy` the strong neutral. Style a <Link> as a button with
// `buttonClass({ variant, size })` instead of nesting a <button> in a link.
const buttonVariants = {
  base: "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-bold transition-[background-color,color,box-shadow,transform,border-color] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 [&_svg]:shrink-0",
  variant: {
    default: "bg-primary text-primary-foreground hover:bg-primary/90",
    coral: "bg-coral text-coral-foreground hover:bg-coral/85 shadow-sm",
    navy: "bg-navy text-navy-foreground hover:bg-navy/85 border border-white/10 dark:border-transparent dark:bg-primary dark:text-primary-foreground dark:hover:bg-primary/85",
    destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
    outline: "border-[1.5px] border-foreground/25 bg-transparent text-foreground hover:bg-accent hover:border-foreground/40",
    secondary: "bg-secondary text-secondary-foreground hover:bg-accent",
    ghost: "text-foreground hover:bg-accent",
    link: "text-primary underline-offset-4 hover:underline rounded-md",
  },
  size: {
    default: "h-11 px-5",
    sm: "h-9 px-4",
    lg: "h-12 px-7 text-base",
    icon: "h-10 w-10",
  },
};

/** Class string for styling non-button elements (e.g. next/link) like a Button. */
function buttonClass({ variant = "default", size = "default", className } = {}) {
  return cn(buttonVariants.base, buttonVariants.variant[variant], buttonVariants.size[size], className);
}

const Button = React.forwardRef(
  ({ className, variant = "default", size = "default", ...props }, ref) => (
    <button className={buttonClass({ variant, size, className })} ref={ref} {...props} />
  )
);
Button.displayName = "Button";

export { Button, buttonVariants, buttonClass };
