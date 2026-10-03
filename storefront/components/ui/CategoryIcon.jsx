import { Apple, Gamepad2, Headphones, HardDrive, Laptop, Monitor, MousePointer2, Package, ShieldCheck, Smartphone, Tablet, Watch } from "lucide-react";

const RULES = [
  [/used|pre-?owned|refurb/, ShieldCheck],
  [/mac|apple/, Apple],
  [/gam/, Gamepad2],
  [/laptop|notebook/, Laptop],
  [/desktop|monitor|all-in-one|display/, Monitor],
  [/tablet|ipad/, Tablet],
  [/watch|wearable/, Watch],
  [/audio|head|ear|speaker|sound/, Headphones],
  [/storage|ssd|disk|drive|memory|ram/, HardDrive],
  [/phone|mobile/, Smartphone],
  [/mouse|keyboard|accessor|charger|adapter|cable/, MousePointer2],
];

/** Lucide icon for a category, chosen from its slug/name (falls back to a box). */
export default function CategoryIcon({ slug = "", name = "", className }) {
  const key = `${slug} ${name}`.toLowerCase();
  const Icon = RULES.find(([re]) => re.test(key))?.[1] || Package;
  return <Icon className={className} aria-hidden="true" />;
}
