import test from 'node:test';
import assert from 'node:assert/strict';
import { calendarTicks } from '../../resources/js/components/healthcare/calendar-math.ts';
test('calendar time cells stay at half-hour intervals when visual density changes', () => {
    assert.deepEqual(calendarTicks(540,660), [540,570,600,630]);
});
test('a complete calendar day has 48 unique cells and ends at 23:30', () => {
    const ticks=calendarTicks(0,1440);
    assert.equal(ticks.length,48);
    assert.equal(new Set(ticks).size,48);
    assert.equal(ticks.at(-1),1410);
});
