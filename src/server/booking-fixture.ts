import { createServer, type Server } from 'node:http';

export const INITIAL_BOOKING_DATE = '2026-10-10';
export const EXPECTED_BOOKING_DATE = '2026-10-20';

export type BookingScenario = 'broken' | 'fixed' | 'alternative';

function bookingPage(scenario: BookingScenario): string {
  const confirmControl = scenario === 'fixed'
    ? '<button id="confirm" type="button">Confirm Reschedule</button>'
    : '<div id="confirm" role="button" tabindex="0" aria-label="Confirm Reschedule">Confirm Reschedule</div>';
  const dateEntry = scenario === 'alternative'
    ? `<form id="date-entry"><label for="new-date">Enter new date</label><input id="new-date" name="newDate" type="text" inputmode="numeric" autocomplete="off" pattern="[0-9]{4}-[0-9]{2}-[0-9]{2}" aria-describedby="date-format"><small id="date-format">Use YYYY-MM-DD</small><button id="save-date" type="submit">Save new date</button></form>`
    : '';

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Controlled booking fixture</title>
<style>body{font:16px system-ui;max-width:38rem;margin:3rem auto;padding:0 1rem;color:#17232b}label{display:block;margin:1rem 0 .4rem}button,[role=button]{display:inline-block;margin:.5rem .5rem .5rem 0;padding:.65rem 1rem;border:1px solid #47616e;border-radius:4px;background:#eef5f7;color:#17232b;cursor:pointer}input{display:block;padding:.6rem;border:1px solid #47616e;border-radius:4px}small{display:block;color:#465b66}#state{margin-top:1rem;padding:.8rem;background:#eef5f7}</style></head>
<body><main><h1>Reschedule booking BK-2048</h1><p>Current booking date: <strong id="booking-date">${INITIAL_BOOKING_DATE}</strong></p>
<button id="date-choice" type="button">Select new date ${EXPECTED_BOOKING_DATE}</button>${dateEntry}${confirmControl}
<p id="selection" aria-live="polite">No new date selected</p><p id="state" role="status" aria-live="polite">Booking unchanged</p></main>
<script>
let selectedDate='';
document.querySelector('#date-choice').addEventListener('click',()=>{selectedDate='${EXPECTED_BOOKING_DATE}';document.querySelector('#selection').textContent='Selected date: '+selectedDate;});
async function saveDate(date){const response=await fetch('/__fixture/reschedule',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({date})});if(response.ok){document.querySelector('#booking-date').textContent=date;document.querySelector('#state').textContent='Booking rescheduled';}}
document.querySelector('#confirm').addEventListener('click',()=>{if(selectedDate)void saveDate(selectedDate);});
const dateForm=document.querySelector('#date-entry');if(dateForm)dateForm.addEventListener('submit',(event)=>{event.preventDefault();void saveDate(document.querySelector('#new-date').value);});
</script></body></html>`;
}

export type BookingFixture = {
  origin: string;
  readBookingDate: () => string;
  close: () => Promise<void>;
};

export function isAllowedFixtureRequest(requestUrl: string, fixtureOrigin: string): boolean {
  try {
    return new URL(requestUrl).origin === new URL(fixtureOrigin).origin;
  } catch {
    return false;
  }
}

export async function startBookingFixture(scenario: BookingScenario = 'broken'): Promise<BookingFixture> {
  let bookingDate = INITIAL_BOOKING_DATE;
  const server: Server = createServer((request, response) => {
    if (request.method === 'GET' && request.url === '/') {
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end(bookingPage(scenario));
      return;
    }
    if (request.method === 'POST' && request.url === '/__fixture/reschedule') {
      let body = '';
      request.on('data', (chunk: Buffer) => {
        body += chunk.toString('utf8');
        if (body.length > 1024) {
          response.writeHead(413).end();
          request.destroy();
        }
      });
      request.on('end', () => {
        try {
          const payload = JSON.parse(body) as { date?: unknown };
          if (typeof payload.date !== 'string' || !isValidIsoDate(payload.date)) {
            response.writeHead(400).end();
            return;
          }
          bookingDate = payload.date;
          response.writeHead(204).end();
        } catch {
          response.writeHead(400).end();
        }
      });
      return;
    }
    response.writeHead(404).end();
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Fixture did not bind to a local port');

  return {
    origin: `http://127.0.0.1:${address.port}`,
    readBookingDate: () => bookingDate,
    close: () => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  };
}

function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}