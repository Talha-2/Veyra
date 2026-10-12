import { calendarTicks } from './calendar-math';
import { useLayoutEffect, useRef } from 'react';
import type { AppointmentRecord } from '../../types/healthcare';
import { dateInZone, timeInZone } from './appointment-form';

export interface CalendarDay { date: string; label: string; weekday: number }
export interface CalendarHours { date: string; start_time: string; end_time: string; location: string }
export interface CalendarBlock { id: number; starts_at: string; ends_at: string; label?: string | null }
export type CalendarView = 'day' | 'week' | 'month' | 'agenda';
export const calendarStatus = (status: string) => status.replaceAll('_', ' ');
const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
function localMinute(instant: string, timezone: string) {
    return minutes(new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(instant)));
}
export function eventsOnDay<T extends { starts_at: string; ends_at: string }>(events: T[], date: string, timezone: string): T[] {
    return events.filter(event => dateInZone(event.starts_at, timezone) <= date && (dateInZone(event.ends_at, timezone) > date || (dateInZone(event.ends_at, timezone) === date && localMinute(event.ends_at, timezone) > 0)));
}
function segment(event: { starts_at: string; ends_at: string }, date: string, timezone: string) {
    return { start: dateInZone(event.starts_at, timezone) < date ? 0 : localMinute(event.starts_at, timezone), end: dateInZone(event.ends_at, timezone) > date ? 1440 : localMinute(event.ends_at, timezone) };
}
function positionedEvents(events: AppointmentRecord[], date: string, timezone: string) {
    const sorted = events.map(event => ({ event, ...segment(event, date, timezone), lane: 0, lanes: 1 })).sort((a, b) => a.start - b.start || b.end - a.end);
    let group: typeof sorted = []; let groupEnd = -1;
    const finish = () => { const count = Math.max(1, ...group.map(item => item.lane + 1)); group.forEach(item => { item.lanes = count; }); };
    for (const item of sorted) {
        const visualEnd = Math.max(item.end, item.start + 20);
        if (item.start >= groupEnd) { finish(); group = []; groupEnd = -1; }
        while (group.some(other => other.lane === item.lane && Math.max(other.end, other.start + 20) > item.start)) item.lane++;
        group.push(item); groupEnd = Math.max(groupEnd, visualEnd);
    }
    finish(); return sorted;
}
export function CalendarTimeGrid({ days, appointments, hours, blocks, timezone, today, onSelect, onBook, canBook }: {
    days: CalendarDay[]; appointments: AppointmentRecord[]; hours: CalendarHours[]; blocks: CalendarBlock[]; timezone: string; today: string;
    onSelect: (event: AppointmentRecord) => void; onBook: (date: string) => void; canBook: boolean;
}) {
    const starts = [...hours.map(h => minutes(h.start_time)), ...days.flatMap(d => eventsOnDay(appointments, d.date, timezone).map(a => segment(a, d.date, timezone).start)), ...days.flatMap(d => eventsOnDay(blocks, d.date, timezone).map(a => segment(a, d.date, timezone).start))];
    const ends = [...hours.map(h => minutes(h.end_time)), ...days.flatMap(d => eventsOnDay(appointments, d.date, timezone).map(a => segment(a, d.date, timezone).end)), ...days.flatMap(d => eventsOnDay(blocks, d.date, timezone).map(a => segment(a, d.date, timezone).end))];
    const start = Math.max(0, Math.floor(Math.min(480, ...starts) / 60) * 60);
    const end = Math.min(1440, Math.ceil(Math.max(1080, ...ends) / 60) * 60);
    const ticks = calendarTicks(start, end);
    const height = (end - start) * 2.4;
    const position = (from: number, to: number) => ({ top: (from - start) * 2.4, height: Math.max(24, (to - from) * 2.4) });
    const now = new Date().toISOString(); const nowMinute = localMinute(now, timezone);
    const canvas = useRef<HTMLDivElement>(null);
    useLayoutEffect(() => {
        if (canvas.current) {
            const focus = starts.length ? Math.min(...starts) : start;
            canvas.current.scrollTop = Math.max(0, (focus - start) * 2.4);
        }
    }, [days[0]?.date, days.length, timezone]);
    return <div className="hc-calendar-scroll" ref={canvas}><div className="hc-time-grid" style={{ minWidth: days.length > 1 ? 1120 : 280, gridTemplateColumns: `56px repeat(${days.length}, minmax(0, 1fr))` }}>
        <div className="hc-day-heading text-xs text-secondary">Time</div>{days.map(day => <div key={day.date} className={'hc-day-heading ' + (day.date === today ? 'text-accent' : '')}><span className="block text-xs text-secondary">{new Date(day.date + 'T12:00:00Z').toLocaleDateString('en', { weekday: 'short', timeZone: 'UTC' })}</span><span className="text-lg font-semibold">{Number(day.date.slice(-2))}</span><span className="mt-1 block text-xs text-secondary">{eventsOnDay(appointments, day.date, timezone).length} visits</span></div>)}
        <div className="hc-time-axis" style={{ height }}>{ticks.filter(t => t % 60 === 0).map(t => <span key={t} className="absolute right-2 text-[11px] text-secondary tabular-nums" style={{ top: (t - start) * 2.4 + 4 }}>{String(t / 60).padStart(2, '0')}:00</span>)}</div>
        {days.map(day => <div key={day.date} className="hc-time-column" style={{ height }}>
            {ticks.map(t => <button key={t} type="button" disabled={!canBook} className="hc-time-cell" style={{ top: (t - start) * 2.4, height: 72 }} aria-label={'Find available appointments on ' + day.label + ' around ' + String(Math.floor(t / 60)).padStart(2, '0') + ':' + (t % 60 ? '30' : '00')} onClick={() => onBook(day.date)} />)}
            {hours.filter(h => h.date === day.date).map((h, i) => <div key={i} className="hc-working-window" style={position(minutes(h.start_time), minutes(h.end_time))}><span>{h.location}</span></div>)}
            {eventsOnDay(blocks, day.date, timezone).map(block => { const range = segment(block, day.date, timezone); return <div key={block.id} className="hc-time-block" style={position(range.start, range.end)}><span>{block.label || 'Unavailable'}</span></div>; })}
            {positionedEvents(eventsOnDay(appointments, day.date, timezone), day.date, timezone).map(({ event, start: from, end: to, lane, lanes }) => <button key={event.id} className={'hc-calendar-event hc-status-' + event.status} style={{ ...position(from, to), left: `calc(${lane / lanes * 100}% + 3px)`, width: `calc(${100 / lanes}% - 6px)` }} onClick={() => onSelect(event)} aria-label={`${event.patient.name}, ${event.service}, ${timeInZone(event.starts_at, timezone)}, ${calendarStatus(event.status)}`}><span className="block truncate font-semibold">{event.patient.name}</span><span className="block truncate tabular-nums">{timeInZone(event.starts_at, timezone)} – {timeInZone(event.ends_at, timezone)}</span>{to - from >= 20 && <span className="block truncate">{event.service}</span>}{to - from >= 30 && <span className="mt-1 block truncate text-xs">{calendarStatus(event.status)} · {event.location}</span>}</button>)}
            {day.date === today && nowMinute >= start && nowMinute < end && <div className="hc-now-line" style={{ top: (nowMinute - start) * 2.4 }} aria-label="Current time" />}
        </div>)}
    </div></div>;
}
export function CalendarMonth({ days, appointments, timezone, today, selectedMonth, onSelect, onDay }: { days: CalendarDay[]; appointments: AppointmentRecord[]; timezone: string; today: string; selectedMonth: string; onSelect: (event: AppointmentRecord) => void; onDay: (date: string) => void }) {
    return <div className="hc-calendar-scroll"><div className="hc-month-grid">{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => <div key={day} className="hc-month-heading">{day}</div>)}{days.map(day => { const events = eventsOnDay(appointments, day.date, timezone); return <section key={day.date} className={'hc-month-day ' + (day.date.slice(0, 7) !== selectedMonth ? 'hc-outside-month' : '')}><button className={'hc-month-date ' + (today === day.date ? 'hc-today-date' : '')} aria-label={'Open ' + day.label} onClick={() => onDay(day.date)}>{Number(day.date.slice(-2))}</button><div className="mt-2 space-y-1">{events.slice(0, 3).map(event => <button key={event.id} className={'hc-month-event hc-status-' + event.status} onClick={() => onSelect(event)}><span className="tabular-nums">{timeInZone(event.starts_at, timezone)}</span><span className="truncate font-medium">{event.patient.name}</span></button>)}{events.length > 3 && <button className="mt-1 text-xs text-accent" onClick={() => onDay(day.date)}>+{events.length - 3} more</button>}</div></section>; })}</div></div>;
}
