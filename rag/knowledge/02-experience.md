# Experience

## AI Engineering Intern at Alemdar Teknik

Omer worked as an AI Engineering Intern at Alemdar Teknik in Nicosia, Cyprus,
from June 2026 to August 2026. The role was hands-on backend and applied ML
work on systems that ran in production for the company's own staff.

## The unified AI messaging dashboard he built at Alemdar Teknik

Omer shipped a production internal system that pulls WhatsApp and Gmail
messages into a single AI dashboard. It runs as three FastAPI services on a
self-hosted Linux server, managed with systemd and exposed to the internet
through Cloudflare tunnels. This was real deployed infrastructure, not a
prototype: staff used it as their day-to-day inbox.

## The latency problem Omer fixed at Alemdar Teknik

Incoming messages were timing out because slow AI calls were blocking the
request path. Omer moved those AI calls onto a background thread, which cut the
response delay from 2.5 seconds to 0.02 seconds and stopped the timeouts. This
is roughly a 125x improvement in response latency.

## The stock-image automation tool Omer built

Many products in the company catalogue had no photograph. Omer built a Flask
tool that reads the product database, finds candidate images on the web, and
returns them with the background removed using an ML segmentation model. This
automated work that had previously been manual.

## Security work Omer did at Alemdar Teknik

Omer hardened the system against prompt injection attacks by wrapping the AI
context in random per-request tags, so that instructions injected into message
content could not escape their boundary and be read as system instructions. He
also added token validation and login rate limits on every entry point.
