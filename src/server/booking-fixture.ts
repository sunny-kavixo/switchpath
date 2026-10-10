import { createServer, type Server } from 'node:http';

export const INITIAL_BOOKING_DATE = '2026-10-10';
export const EXPECTED_BOOKING_DATE = '2026-10-20';

const page = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Controlled booking fixture</title>
<style>body{font:16px system-ui;max-width:38rem;margin:3rem auto;padding:0 1rem;color:#17232b}label{display:block;margin:1rem 0 .4rem}button,[role=button]{display:inline-block;margin:.5rem .5rem .5rem 0;padding:.65rem 1rem;border:1px solid #47616e;border-radius:4px;background:#eef5f7;color:#17232b;cursor:pointer}#state{margin-top:1rem;padding:.8rem;background:#eef5f7}</style></head>
<body><main><h1>Reschedule booking BK-2048</h1><p>Current booking date: <strong id="booking-date">${INITIAL_BOOKING_DATE}</strong></p>
<button id="date-choice" type="button">Select new date ${EXPECTED_BOOKING_DATE}</button>
<div id="confirm" role="button" tabindex="0" aria-label="Confirm Reschedule">Confirm Reschedule</div>
<p id="selection" aria-live="polite">No new date selected</p><p id="state" role="status" aria-live="polite">Booking unchanged</p></main>
<script>
let selectedDate='';
document.querySelector('#date-choice').addEventListener('click',()=>{selectedDate='${EXPECTED_BOOKING_DATE}';document.querySelector('#selection').textContent='Selected date: '+selectedDate;});
document.querySelector('#confirm').addEventListener('click',async()=>{if(!selectedDate)return;const response=await fetch('/__fixture/reschedule',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({date:selectedDate})});if(response.ok){document.querySelector('#booking-date').textContent=selectedDate;document.querySelector('#state').textContent='Booking rescheduled';}});
</script></body></html>`;

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

export async function startBookingFixture(): Promise<BookingFixture> {
  let bookingDate = INITIAL_BOOKING_DATE;
  const server: Server = createServer((request, response) => {
    if (request.method === 'GET' && request.url === '/') {
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end(page);
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
          if (payload.date !== EXPECTED_BOOKING_DATE) {
            response.writeHead(400).end();
            return;
          }
          bookingDate = EXPECTED_BOOKING_DATE;
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