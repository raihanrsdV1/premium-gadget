import { useState } from 'react';
import axiosInstance from '../services/axiosInstance';

export const useRepairTracker = () => {
  const [status, setStatus] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  // Backend repair.service expects { ticket_number, phone } as query params
  const trackRepair = async (ticketNumber, phone) => {
    setIsLoading(true);
    setError(null);
    setStatus(null);
    try {
      const { data } = await axiosInstance.get('/repairs/track', {
        params: { ticket_number: ticketNumber, phone },
      });
      setStatus(data.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Ticket not found. Please check your details.');
    } finally {
      setIsLoading(false);
    }
  };

  return { trackRepair, status, isLoading, error };
};
