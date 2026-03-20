import React, { useState } from 'react';
import { useSelector } from 'react-redux';
import { Navigate, Link } from 'react-router-dom';
import { Check, ShieldCheck, MapPin, CreditCard, ChevronRight } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Card, CardContent } from '../components/ui/Card';

const CheckoutPage = () => {
  const { items, totalAmount } = useSelector(state => state.cart);
  const { user } = useSelector(state => state.auth);
  
  const [step, setStep] = useState(1);
  const [shippingMethod, setShippingMethod] = useState('inside_dhaka'); // 100BDT
  const [paymentMethod, setPaymentMethod] = useState('sslcommerz');
  
  const shippingFee = shippingMethod === 'inside_dhaka' ? 100 : 200;
  const grandTotal = totalAmount + shippingFee;

  // Protect route loosely for checkout (real app uses ProtectedRoute component)
  if (!user && window.location.pathname.includes('checkout')) {
    // In actual routing this is handled, but fallback provided
  }

  const handlePaymentSubmit = (e) => {
    e.preventDefault();
    // TODO: Init SSL Commerz Payment API using RTK Query mutation
    alert('Redirecting to SSL Commerz Gateway...');
  };

  return (
    <div className="bg-secondary/20 min-h-[80vh] py-8">
      <div className="container px-4">
        
        <div className="flex items-center justify-center space-x-2 sm:space-x-4 mb-10 text-sm font-medium">
           <div className={`flex items-center ${step >= 1 ? 'text-primary' : 'text-muted-foreground'}`}>
              <div className={`w-6 h-6 rounded-full flex items-center justify-center mr-2 text-xs text-white ${step >= 1 ? 'bg-primary' : 'bg-muted-foreground'}`}>1</div>
              Delivery
           </div>
           <ChevronRight className="h-4 w-4 text-muted-foreground" />
           <div className={`flex items-center ${step >= 2 ? 'text-primary' : 'text-muted-foreground'}`}>
              <div className={`w-6 h-6 rounded-full flex items-center justify-center mr-2 text-xs text-white ${step >= 2 ? 'bg-primary' : 'bg-muted-foreground'}`}>2</div>
              Payment
           </div>
           <ChevronRight className="h-4 w-4 text-muted-foreground" />
           <div className={`flex items-center ${step >= 3 ? 'text-primary' : 'text-muted-foreground'}`}>
              <div className={`w-6 h-6 rounded-full flex items-center justify-center mr-2 text-xs text-white ${step >= 3 ? 'bg-primary' : 'bg-muted-foreground'}`}>3</div>
              Confirm
           </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          <div className="lg:col-span-2 space-y-6">
            
            {/* Step 1: Address */}
            <Card className={`overflow-hidden transition-all ${step === 1 ? 'ring-2 ring-primary ring-offset-2 border-transparent' : 'opacity-70'}`}>
               <CardContent className="p-6">
                 <div className="flex items-center mb-6">
                   <MapPin className="h-6 w-6 text-primary mr-3" />
                   <h2 className="text-xl font-bold">Shipping Address</h2>
                 </div>
                 
                 {step === 1 ? (
                   <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); setStep(2); }}>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                         <div className="space-y-2">
                           <label className="text-sm font-medium">Full Name</label>
                           <Input placeholder="John Doe" defaultValue={user?.full_name} required />
                         </div>
                         <div className="space-y-2">
                           <label className="text-sm font-medium">Phone Number</label>
                           <Input placeholder="017XXXXXXXX" defaultValue={user?.phone} required />
                         </div>
                      </div>
                      
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                         <div className="space-y-2">
                           <label className="text-sm font-medium">Division</label>
                           <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" required>
                             <option value="">Select Division</option>
                             <option value="Dhaka">Dhaka</option>
                             <option value="Chattogram">Chattogram</option>
                             <option value="Sylhet">Sylhet</option>
                           </select>
                         </div>
                         <div className="space-y-2">
                           <label className="text-sm font-medium">District</label>
                           <Input placeholder="e.g. Dhaka City" required />
                         </div>
                      </div>
                      
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Complete Street Address & Area</label>
                        <Input placeholder="House 12, Road 4, Banani" required />
                      </div>

                      <div className="pt-4 border-t mt-6">
                         <h3 className="font-semibold mb-3">Shipping Method</h3>
                         <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <label className={`border rounded-lg p-4 cursor-pointer flex items-start space-x-3 transition-colors ${shippingMethod === 'inside_dhaka' ? 'border-primary bg-primary/5' : 'hover:border-primary/50'}`}>
                               <input type="radio" name="shipping" checked={shippingMethod === 'inside_dhaka'} onChange={() => setShippingMethod('inside_dhaka')} className="mt-1" />
                               <div>
                                 <div className="font-medium">Inside Dhaka</div>
                                 <div className="text-sm text-muted-foreground mt-1">1-2 Business Days</div>
                                 <div className="font-bold text-primary mt-2">৳100</div>
                               </div>
                            </label>
                            <label className={`border rounded-lg p-4 cursor-pointer flex items-start space-x-3 transition-colors ${shippingMethod === 'outside_dhaka' ? 'border-primary bg-primary/5' : 'hover:border-primary/50'}`}>
                               <input type="radio" name="shipping" checked={shippingMethod === 'outside_dhaka'} onChange={() => setShippingMethod('outside_dhaka')} className="mt-1" />
                               <div>
                                 <div className="font-medium">Outside Dhaka</div>
                                 <div className="text-sm text-muted-foreground mt-1">3-5 Business Days</div>
                                 <div className="font-bold text-primary mt-2">৳200</div>
                               </div>
                            </label>
                         </div>
                      </div>
                      
                      <div className="flex justify-end pt-6">
                        <Button type="submit">Continue to Payment</Button>
                      </div>
                   </form>
                 ) : (
                   <div className="flex justify-between items-center text-sm">
                      <div>
                        <p className="font-medium">Delivery to:</p>
                        <p className="text-muted-foreground mt-1">House 12, Road 4, Banani, Dhaka</p>
                      </div>
                      <Button variant="outline" size="sm" onClick={() => setStep(1)}>Edit</Button>
                   </div>
                 )}
               </CardContent>
            </Card>

            {/* Step 2: Payment */}
            <Card className={`overflow-hidden transition-all ${step === 2 ? 'ring-2 ring-primary ring-offset-2 border-transparent' : step < 2 ? 'opacity-50 pointer-events-none' : 'opacity-70'}`}>
               <CardContent className="p-6">
                 <div className="flex items-center mb-6">
                   <CreditCard className="h-6 w-6 text-primary mr-3" />
                   <h2 className="text-xl font-bold">Payment Method</h2>
                 </div>
                 
                 {step === 2 && (
                   <div className="space-y-4">
                     <label className={`border rounded-lg p-4 cursor-pointer flex items-center space-x-4 transition-colors border-primary bg-primary/5`}>
                         <div className="shrink-0 flex items-center justify-center w-6 h-6 rounded-full border-4 border-primary bg-white"></div>
                         <div className="flex-1">
                           <div className="font-medium">Online Payment (SSL Commerz)</div>
                           <div className="text-sm text-muted-foreground mt-1">Credit Cards, bKash, Nagad, Rocket</div>
                         </div>
                         <div className="flex space-x-1 grayscale shrink-0">
                            {/* Dummy gateway logos */}
                            <div className="h-6 w-10 bg-slate-200 rounded"></div>
                            <div className="h-6 w-10 bg-slate-200 rounded"></div>
                            <div className="h-6 w-10 bg-slate-200 rounded"></div>
                         </div>
                     </label>
                     <p className="text-xs text-muted-foreground mt-4 px-2">
                       You will be securely redirected to the SSL Commerz gateway to complete your purchase safely.
                     </p>
                   </div>
                 )}
               </CardContent>
            </Card>
          </div>
          
          {/* Order Summary */}
          <div className="lg:col-span-1">
             <Card className="sticky top-24 border-border/50">
                <CardContent className="p-6">
                   <h2 className="text-lg font-bold mb-4 border-b pb-4">Your Order</h2>
                   
                   <div className="space-y-4 mb-6 max-h-[300px] overflow-y-auto custom-scrollbar pr-2">
                     {items.map(item => (
                       <div key={item.id} className="flex justify-between text-sm">
                          <div className="flex items-start">
                             <span className="font-medium mr-2">{item.quantity}x</span>
                             <span className="text-muted-foreground line-clamp-2">{item.name}</span>
                          </div>
                          <span className="font-medium ml-4 shrink-0">৳{item.totalPrice.toLocaleString()}</span>
                       </div>
                     ))}
                   </div>
                   
                   <div className="space-y-3 mb-6 text-sm border-t pt-4">
                      <div className="flex justify-between">
                         <span className="text-muted-foreground">Subtotal</span>
                         <span className="font-medium">৳{totalAmount.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between">
                         <span className="text-muted-foreground">Shipping</span>
                         <span className="font-medium">৳{shippingFee.toLocaleString()}</span>
                      </div>
                      
                      <div className="flex justify-between pt-3 pb-1 text-lg font-bold border-t mt-2">
                         <span>Total</span>
                         <span className="text-primary">৳{grandTotal.toLocaleString()}</span>
                      </div>
                   </div>
                   
                   <Button size="lg" className="w-full text-base font-bold" disabled={step !== 2} onClick={handlePaymentSubmit}>
                     Pay Securely Now
                   </Button>
                   
                   <div className="flex items-center justify-center mt-6 text-xs text-muted-foreground">
                      <ShieldCheck className="h-4 w-4 mr-1.5" /> 256-bit SSL encryption
                   </div>
                </CardContent>
             </Card>
          </div>

        </div>
      </div>
    </div>
  );
};

export default CheckoutPage;
