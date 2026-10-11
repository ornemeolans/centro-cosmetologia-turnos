import { describe, expect, it } from 'vitest';
import { buildIcs, googleCalendarUrl, type CalendarEvent } from './calendar';

const event: CalendarEvent = {
  uid: 'abc@turnos',
  sequence: 1,
  title: 'Limpieza facial, con Ana',
  description: 'Seña pagada.\nSaldo en el local',
  location: 'Av. Siempre Viva 123',
  start: new Date('2026-11-09T13:00:00Z'),
  end: new Date('2026-11-09T14:00:00Z'),
};

describe('calendario', () => {
  it('genera un .ics válido con UID estable y caracteres escapados', () => {
    const ics = buildIcs(event, new Date('2026-10-10T00:00:00Z'));
    expect(ics).toContain('UID:abc@turnos');
    expect(ics).toContain('SEQUENCE:1');
    expect(ics).toContain('DTSTART:20261109T130000Z');
    expect(ics).toContain('SUMMARY:Limpieza facial\\, con Ana');
    expect(ics).toContain('DESCRIPTION:Seña pagada.\\nSaldo en el local');
    expect(ics.split('\r\n').every((l) => l.length <= 75)).toBe(true);
  });

  it('un turno cancelado se publica como cancelación del mismo evento', () => {
    const ics = buildIcs({ ...event, canceled: true, sequence: 2 });
    expect(ics).toContain('METHOD:CANCEL');
    expect(ics).toContain('STATUS:CANCELLED');
  });

  it('arma el enlace de Google Calendar', () => {
    const url = new URL(googleCalendarUrl(event));
    expect(url.searchParams.get('dates')).toBe('20261109T130000Z/20261109T140000Z');
    expect(url.searchParams.get('text')).toBe(event.title);
  });
});
