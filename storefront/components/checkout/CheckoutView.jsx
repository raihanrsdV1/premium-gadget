"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { useSelector } from "react-redux";
import { ShieldCheck, MapPin, CreditCard, ChevronRight, ChevronLeft, AlertCircle, Loader2, Info, XCircle, Banknote } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card, CardContent } from "@/components/ui/Card";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import CatMascot from "@/components/ui/CatMascot";
import { SITE } from "@/lib/site";
import { createOrder } from "@/lib/api/orders";
import { getPublicSettings } from "@/lib/api/settings";
import { BD_DIVISIONS, zoneForAddress } from "@/lib/bdLocations";

// Ported from frontend/src/pages/CheckoutPage.jsx.
// UI + cart→order payload only. The actual order SUBMISSION (two-phase
// reserve→confirm: order.service.create + SSLCommerz) is a deferred phase and
// is intentionally left as a visible TODO — no fake success.
export default function CheckoutView() {
  const ready = useRequireAuth();
  const router = useRouter();
  const params = useSearchParams();
  const paymentReturn = params.get("payment"); // 'failed' | 'cancelled' after a gateway return
  const { items, totalAmount } = useSelector((state) => state.cart);
  const { user } = useSelector((state) => state.auth);

  const [step, setStep] = useState(1);
  const [address, setAddress] = useState({ full_name: "", phone: "", division: "", district: "", street: "" });
  const [paymentMethod, setPaymentMethod] = useState("card");
  const [settings, setSettings] = useState(null);
  const [couponCode, setCouponCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [placedPending, setPlacedPending] = useState(null); // order placed but gateway URL unavailable
  // Popup shown when returning from the gateway after a failed/cancelled payment.
  const [paymentModal, setPaymentModal] = useState(paymentReturn);

  const dismissPaymentModal = () => {
    setPaymentModal(null);
    router.replace("/checkout", { scroll: false }); // drop ?payment= so reload won't re-show
  };

  // Delivery zones / fees and COD availability come from the shop's settings.
  useEffect(() => {
    getPublicSettings().then(setSettings).catch(() => setSettings(null));
  }, []);

  // Prefill name/phone from the account (the user can still edit them).
  useEffect(() => {
    if (!user) return;
    setAddress((a) => ({ ...a, full_name: a.full_name || user.full_name || "", phone: a.phone || user.phone || "" }));
  }, [user]);

  const zones = settings?.shipping?.zones || [];
  const zone = address.division && address.district ? zoneForAddress(zones, address) : null;
  const freeOver = settings?.shipping?.free_shipping_threshold;
  const shippingFee = zone ? (freeOver != null && totalAmount >= Number(freeOver) ? 0 : Number(zone.fee)) : null;
  const grandTotal = totalAmount + (shippingFee || 0);
  const codEnabled = Boolean(settings?.checkout?.cod_enabled);

  if (!ready) return null;

  if (items.length === 0 && !placedPending) {
    return (
      <div className="container px-4 py-24 text-center">
        <h1 className="text-2xl font-semibold mb-3">Your cart is empty</h1>
        <p className="text-muted-foreground mb-8">
          {paymentReturn === "cancelled"
            ? "Your payment was cancelled. Check My Orders for the order's current status."
            : paymentReturn === "failed"
            ? "Your payment could not be completed. Check My Orders for the order's current status."
            : paymentReturn === "pending"
            ? "We couldn't confirm your payment yet. It will update automatically in My Orders within a few minutes."
            : "Add some products before checking out."}
        </p>
        <Link href="/products"><Button size="lg">Browse Products</Button></Link>
      </div>
    );
  }

  const handlePlaceOrder = async (e) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    // Cart line ids are always variant_ids (enforced at add time).
    const payload = {
      items: items.map((i) => ({ variant_id: i.id, quantity: i.quantity })),
      // The API derives the delivery zone from the address; send ours only if known.
      ...(zone ? { shipping_method: zone.code } : {}),
      shipping_address: address,
      coupon_code: couponCode.trim() || undefined,
      payment_method: paymentMethod,
    };
    try {
      const result = await createOrder(payload);
      if (paymentMethod === "cod" && result?.order_number) {
        router.push(`/order-success?ref=${encodeURIComponent(result.order_number)}`);
        return;
      }
      if (result?.redirect_url) {
        // Hand off to the SSLCommerz gateway. The cart is cleared on the
        // confirmation page after a validated payment.
        window.location.href = result.redirect_url;
        return;
      }
      // Order placed (pending, reserved) but no gateway session — surface it
      // honestly rather than faking success.
      setPlacedPending(result);
    } catch (err) {
      setError(err.data?.message || "Could not place your order. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-[80vh] py-5 sm:py-8">
      {/* Payment failed/cancelled popup (on return from the gateway) */}
      {paymentModal && (
        <div role="dialog" aria-modal="true" aria-label="Payment status" className="fixed inset-0 z-[80] flex items-center justify-center bg-navy/60 p-4 backdrop-blur-[2px]" onClick={dismissPaymentModal}>
          <div className="bg-background rounded-3xl p-6 max-w-sm w-full text-center shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="w-14 h-14 rounded-full bg-amber-100 dark:bg-amber-950/40 flex items-center justify-center mx-auto mb-4">
              <XCircle className="h-8 w-8 text-amber-600" />
            </div>
            <h3 className="font-display text-xl font-extrabold mb-2">
              {paymentModal === "pending" ? "Payment being confirmed" : paymentModal === "cancelled" ? "Payment cancelled" : "Payment failed"}
            </h3>
            <p className="text-muted-foreground text-sm mb-6">
              {paymentModal === "pending"
                ? "We couldn't confirm your payment with the gateway yet. If money was taken, your order will be confirmed automatically — check My Orders in a few minutes."
                : paymentModal === "cancelled"
                ? "You cancelled the payment, so no charge was made."
                : "Your payment couldn’t be completed, so no charge was made."}{" "}
              {paymentModal !== "pending" && "Your items are still in your cart — you can review and try again."}
            </p>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => { dismissPaymentModal(); router.push("/cart"); }}>
                Back to Cart
              </Button>
              <Button className="flex-1" onClick={dismissPaymentModal}>
                Try Again
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="container">
        {/* Back to cart — editable at any time */}
        <Link href="/cart" className="inline-flex items-center text-sm font-medium text-muted-foreground hover:text-foreground mb-6">
          <ChevronLeft className="h-4 w-4 mr-1" /> Back to cart
        </Link>

        {/* Stepper (Delivery is clickable to go back and edit) */}
        <div className="flex items-center justify-center space-x-2 sm:space-x-4 mb-6 text-sm font-bold sm:mb-10">
          <button
            type="button"
            onClick={() => setStep(1)}
            className={`flex items-center ${step >= 1 ? "text-primary" : "text-muted-foreground"} ${step > 1 ? "hover:underline cursor-pointer" : ""}`}
          >
            <div className={`w-6 h-6 rounded-full flex items-center justify-center mr-2 text-xs font-bold text-primary-foreground ${step >= 1 ? "bg-primary" : "bg-muted-foreground"}`}>1</div>
            Delivery
          </button>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
          <div className={`flex items-center ${step >= 2 ? "text-primary" : "text-muted-foreground"}`}>
            <div className={`w-6 h-6 rounded-full flex items-center justify-center mr-2 text-xs font-bold text-primary-foreground ${step >= 2 ? "bg-primary" : "bg-muted-foreground"}`}>2</div>
            Payment
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            {/* Step 1: Address */}
            <Card className={`overflow-hidden transition-all ${step === 1 ? "ring-2 ring-primary ring-offset-2 border-transparent" : "opacity-70"}`}>
              <CardContent className="p-6">
                <div className="flex items-center mb-6">
                  <MapPin className="h-6 w-6 text-primary mr-3" />
                  <h2 className="font-display text-xl font-extrabold">Shipping address</h2>
                </div>

                {step === 1 ? (
                  <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); setStep(2); }}>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label htmlFor="co-name" className="text-sm font-bold">Full Name</label>
                        <Input id="co-name" placeholder="Full name" autoComplete="name" value={address.full_name} onChange={(e) => setAddress({ ...address, full_name: e.target.value })} required />
                      </div>
                      <div className="space-y-2">
                        <label htmlFor="co-phone" className="text-sm font-bold">Phone Number</label>
                        <Input id="co-phone" type="tel" inputMode="numeric" autoComplete="tel" placeholder="017XXXXXXXX" value={address.phone} onChange={(e) => setAddress({ ...address, phone: e.target.value })} required />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label htmlFor="co-division" className="text-sm font-bold">Division</label>
                        <select
                          id="co-division"
                          className="flex h-11 w-full rounded-xl border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                          value={address.division}
                          onChange={(e) => setAddress({ ...address, division: e.target.value, district: "" })}
                          required
                        >
                          <option value="">Select Division</option>
                          {Object.keys(BD_DIVISIONS).map((d) => <option key={d} value={d}>{d}</option>)}
                        </select>
                      </div>
                      <div className="space-y-2">
                        <label htmlFor="co-district" className="text-sm font-bold">District</label>
                        <select
                          id="co-district"
                          className="flex h-11 w-full rounded-xl border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                          value={address.district}
                          onChange={(e) => setAddress({ ...address, district: e.target.value })}
                          disabled={!address.division}
                          required
                        >
                          <option value="">{address.division ? "Select District" : "Select a division first"}</option>
                          {(BD_DIVISIONS[address.division] || []).map((d) => <option key={d} value={d}>{d}</option>)}
                        </select>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label htmlFor="co-street" className="text-sm font-bold">Complete Street Address &amp; Area</label>
                      <Input id="co-street" placeholder="House 12, Road 4, Banani" value={address.street} onChange={(e) => setAddress({ ...address, street: e.target.value })} required />
                    </div>

                    <div className="pt-4 border-t mt-6">
                      <h3 className="font-semibold mb-2">Delivery</h3>
                      {zone ? (
                        <div className="border-[1.5px] rounded-2xl p-4 border-primary bg-tint flex items-center justify-between">
                          <div>
                            <div className="font-medium">{zone.label}</div>
                            {zone.eta && <div className="text-sm text-muted-foreground mt-1">{zone.eta}</div>}
                          </div>
                          <div className="font-bold text-primary">{shippingFee === 0 ? "Free" : `৳${shippingFee.toLocaleString("en-IN")}`}</div>
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">Choose your division and district to see the delivery charge.</p>
                      )}
                    </div>

                    <div className="flex justify-end pt-6">
                      <Button type="submit">Continue to Payment</Button>
                    </div>
                  </form>
                ) : (
                  <div className="flex justify-between items-center text-sm">
                    <div>
                      <p className="font-medium">Delivery to:</p>
                      <p className="text-muted-foreground mt-1">
                        {[address.street, address.district, address.division].filter(Boolean).join(", ") || "Address provided"}
                      </p>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => setStep(1)}>Edit</Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Step 2: Payment */}
            <Card className={`overflow-hidden transition-all ${step === 2 ? "ring-2 ring-primary ring-offset-2 border-transparent" : step < 2 ? "opacity-50 pointer-events-none" : "opacity-70"}`}>
              <CardContent className="p-6">
                <div className="flex items-center mb-6">
                  <CreditCard className="h-6 w-6 text-primary mr-3" />
                  <h2 className="font-display text-xl font-extrabold">Payment method</h2>
                </div>
                {step === 2 && (
                  <div className="space-y-4">
                    <label className={`border-[1.5px] rounded-2xl p-4 cursor-pointer flex items-center space-x-4 transition-colors ${paymentMethod === "card" ? "border-primary bg-tint" : "hover:border-primary/50"}`}>
                      <input type="radio" name="payment" className="accent-primary h-4 w-4" checked={paymentMethod === "card"} onChange={() => setPaymentMethod("card")} />
                      <CreditCard className="h-5 w-5 text-primary shrink-0" />
                      <div className="flex-1">
                        <div className="font-medium">Online Payment (SSLCommerz)</div>
                        <div className="text-sm text-muted-foreground mt-1">Cards, bKash, Nagad, Rocket</div>
                      </div>
                    </label>
                    {codEnabled && (
                      <label className={`border-[1.5px] rounded-2xl p-4 cursor-pointer flex items-center space-x-4 transition-colors ${paymentMethod === "cod" ? "border-primary bg-tint" : "hover:border-primary/50"}`}>
                        <input type="radio" name="payment" className="accent-primary h-4 w-4" checked={paymentMethod === "cod"} onChange={() => setPaymentMethod("cod")} />
                        <Banknote className="h-5 w-5 text-primary shrink-0" />
                        <div className="flex-1">
                          <div className="font-medium">Cash on Delivery</div>
                          <div className="text-sm text-muted-foreground mt-1">Pay when you receive it. We&apos;ll call to confirm your order.</div>
                        </div>
                      </label>
                    )}
                    <div className="space-y-2 pt-2">
                      <label htmlFor="co-coupon" className="text-sm font-bold">Coupon Code (optional)</label>
                      <Input id="co-coupon" placeholder="e.g. WELCOME20" value={couponCode} onChange={(e) => setCouponCode(e.target.value)} />
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                      {paymentMethod === "cod"
                        ? "Your order is reserved now; our team will call you to confirm before delivery."
                        : "You will be securely redirected to the SSLCommerz gateway to complete your payment."}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {error && (
              <Card className="border-destructive/40 bg-destructive/5">
                <CardContent className="p-4 flex items-center gap-2 text-sm text-destructive">
                  <AlertCircle className="h-4 w-4 shrink-0" /> {error}
                </CardContent>
              </Card>
            )}

            {/* Order placed but the payment gateway session wasn't available */}
            {placedPending && (
              <Card className="border-primary/40 bg-tint">
                <CardContent className="p-6">
                  <div className="flex items-center gap-2 mb-2 text-primary">
                    <Info className="h-5 w-5" />
                    <h3 className="font-bold">Order placed — payment pending</h3>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Your order <span className="font-semibold text-foreground">#{placedPending.order_number}</span> was placed and stock reserved, but the payment gateway is currently unavailable, so no payment was taken. You can view it under{" "}
                    <Link href="/orders" className="text-primary underline">My Orders</Link>.
                  </p>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Order Summary */}
          <div className="lg:col-span-1">
            <Card className="lg:sticky lg:top-24 border-border bg-tint">
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4 border-b pb-4">
                  <h2 className="font-display text-lg font-extrabold">Your order</h2>
                  <Link href="/cart" className="text-xs font-medium text-primary hover:underline">Edit cart</Link>
                </div>
                <div className="space-y-4 mb-6 max-h-[300px] overflow-y-auto pr-2">
                  {items.map((item) => (
                    <div key={item.id} className="flex justify-between text-sm">
                      <div className="flex items-start">
                        <span className="font-medium mr-2">{item.quantity}x</span>
                        <span className="text-muted-foreground line-clamp-2">{item.name}</span>
                      </div>
                      <span className="font-medium ml-4 shrink-0">৳{item.totalPrice.toLocaleString("en-IN")}</span>
                    </div>
                  ))}
                </div>
                <div className="space-y-3 mb-6 text-sm border-t pt-4">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span className="font-medium">৳{totalAmount.toLocaleString("en-IN")}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Shipping</span>
                    <span className="font-medium">{shippingFee == null ? "—" : shippingFee === 0 ? "Free" : `৳${shippingFee.toLocaleString("en-IN")}`}</span>
                  </div>
                  <div className="flex justify-between pt-3 pb-1 text-lg font-bold border-t mt-2">
                    <span>Total</span>
                    <span className="font-display font-extrabold text-primary">৳{grandTotal.toLocaleString("en-IN")}</span>
                  </div>
                </div>
                <Button size="lg" variant="coral" className="w-full text-base font-extrabold" disabled={step !== 2 || submitting} onClick={handlePlaceOrder}>
                  {submitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Placing Order…</> : "Place Order"}
                </Button>
                <div className="flex items-center justify-center mt-6 text-xs text-muted-foreground">
                  <ShieldCheck className="h-4 w-4 mr-1.5" /> 256-bit SSL encryption
                </div>
                <div className="mt-4 flex items-center justify-center gap-2 border-t pt-4 text-sm">
                  <CatMascot size={44} />
                  <p>Questions? <a href={SITE.whatsappUrl} target="_blank" rel="noopener noreferrer" className="font-bold text-primary hover:underline">WhatsApp us</a></p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
