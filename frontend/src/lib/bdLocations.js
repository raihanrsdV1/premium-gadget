// Bangladesh's 8 divisions and 64 districts — same list as the storefront
// checkout. Division names match the API's validation.
export const BD_DIVISIONS = {
  Barishal: ["Barguna", "Barishal", "Bhola", "Jhalokati", "Patuakhali", "Pirojpur"],
  Chattogram: [
    "Bandarban", "Brahmanbaria", "Chandpur", "Chattogram", "Cox's Bazar", "Cumilla",
    "Feni", "Khagrachhari", "Lakshmipur", "Noakhali", "Rangamati",
  ],
  Dhaka: [
    "Dhaka", "Faridpur", "Gazipur", "Gopalganj", "Kishoreganj", "Madaripur", "Manikganj",
    "Munshiganj", "Narayanganj", "Narsingdi", "Rajbari", "Shariatpur", "Tangail",
  ],
  Khulna: ["Bagerhat", "Chuadanga", "Jashore", "Jhenaidah", "Khulna", "Kushtia", "Magura", "Meherpur", "Narail", "Satkhira"],
  Mymensingh: ["Jamalpur", "Mymensingh", "Netrokona", "Sherpur"],
  Rajshahi: ["Bogura", "Chapai Nawabganj", "Joypurhat", "Naogaon", "Natore", "Pabna", "Rajshahi", "Sirajganj"],
  Rangpur: ["Dinajpur", "Gaibandha", "Kurigram", "Lalmonirhat", "Nilphamari", "Panchagarh", "Rangpur", "Thakurgaon"],
  Sylhet: ["Habiganj", "Moulvibazar", "Sunamganj", "Sylhet"],
};

const norm = (s) => String(s || "").trim().toLowerCase();

/**
 * Pick the delivery zone for an address — same rule as the API: a zone that
 * lists the district, else one that lists the division, else the default.
 */
export function zoneForAddress(zones = [], { division, district } = {}) {
  if (!zones.length) return null;
  const byDistrict = zones.find((z) => (z.districts || []).some((d) => norm(d) === norm(district)));
  if (byDistrict) return byDistrict;
  const byDivision = zones.find((z) => (z.divisions || []).some((d) => norm(d) === norm(division)));
  if (byDivision) return byDivision;
  return zones.find((z) => z.is_default) || zones[zones.length - 1];
}
