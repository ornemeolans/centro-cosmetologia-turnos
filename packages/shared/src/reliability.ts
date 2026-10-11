export interface ClientStats {
  /** Turnos confirmados en la ventana (últimos 6 meses por defecto). */
  confirmed: number;
  completed: number;
  noShows: number;
  lateCancellations: number;
}

export interface ReliabilityThresholds {
  minAppointments: number;
  minCompletionRate: number;
}

export const DEFAULT_RELIABILITY: ReliabilityThresholds = { minAppointments: 3, minCompletionRate: 0.9 };

/** Clienta cumplidora: prioridad en lista de espera y alertas de último momento. */
export function isReliableClient(stats: ClientStats, t: ReliabilityThresholds = DEFAULT_RELIABILITY): boolean {
  if (stats.completed < t.minAppointments) return false;
  if (stats.noShows > 0 || stats.lateCancellations > 0) return false;
  return stats.confirmed > 0 && stats.completed / stats.confirmed >= t.minCompletionRate;
}
