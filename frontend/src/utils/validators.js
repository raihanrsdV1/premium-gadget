export const isValidPhoneBD = (phone) => {
  const regex = /^(?:\+88|88)?(01[3-9]\d{8})$/;
  return regex.test(phone);
};

export const isValidEmail = (email) => {
  if (!email) return true; // Optional field in our schema
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(email);
};
