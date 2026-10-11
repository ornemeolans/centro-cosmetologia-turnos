import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

interface BookingState {
  professionalId?: string;
  treatmentIds: string[];
  slotStart?: string;
  appointmentId?: string;
  holdExpiresAt?: string;
  set: (patch: Partial<Omit<BookingState, 'set' | 'reset'>>) => void;
  reset: () => void;
}

/** Estado del asistente de reserva; en sessionStorage para sobrevivir la redirección a Mercado Pago. */
export const useBookingStore = create<BookingState>()(
  persist(
    (set) => ({
      treatmentIds: [],
      set: (patch) => set(patch),
      reset: () => set({ professionalId: undefined, treatmentIds: [], slotStart: undefined, appointmentId: undefined, holdExpiresAt: undefined }),
    }),
    { name: 'booking', storage: createJSONStorage(() => sessionStorage) },
  ),
);
