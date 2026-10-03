/**
 * Human-readable message from an RTK Query / fetch error. Uses the API's
 * field-level validation messages when present.
 */
export const errorText = (err, fallback = 'Something went wrong. Please try again.') => {
  const data = err?.data;
  if (data?.errors?.length) {
    return data.errors.map((e) => (e.field ? `${e.field}: ${e.message}` : e.message)).join(' · ');
  }
  if (data?.message) return data.message;
  if (err?.status === 'FETCH_ERROR') return "Can't reach the server. Check the internet connection.";
  return fallback;
};
