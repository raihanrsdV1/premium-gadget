export const processSSLCommerzPayment = async (orderData) => {
  console.log('Initiating SSLCommerz for', orderData);
  // Real implementation will call backend to get Gateway URL
  return { success: true, redirectUrl: '/checkout/success' };
};
