# 🦃 Beaudoin Family Thanksgiving

Sign-up site for Thanksgiving: Thursday 11/26 at 1 pm, Danny & Barb's, 1 Leonard Lane, Wilmington, MA.

- Danny & Barb cover the turkey; their son Sammy makes Mémère's tourtière
- Suggested dishes (just suggestions); anyone can sign up for a dish, double up, or add their own
- RSVP with adult/kid counts (running total, no target)
- "Thankful For" quotes
- Add to Calendar (`thanksgiving.ics` or Google), directions, countdown, and Thanksgiving Day forecast (Open-Meteo)
- Under the invitation: "Thirteen at the table, and six dishes on it", a live "Still needed" list (tap to sign up), and a place card for each family
- Tap the title

Design: a printed menu card. Cormorant Garamond + EB Garamond, cream paper, brown-black ink, one cranberry accent, no emoji.

- Live updates over Supabase Realtime (`live.js`, no library): sign-ups appear instantly with a "just signed up" note
- TV mode (`tv.html`): a slow, live slideshow for the big screen on Thursday — the invitation, who's here, then photos and thankful notes taking turns. Tap to start (full screen, keeps the screen awake); arrow keys move between slides

- Photos open Thanksgiving 6 a.m. ET through Friday (hosts' phones any time); thankful notes are open all week
- Scan-to-add: TV mode shows a QR code to `add.html`, where guests post a photo (resized on the phone, location data stripped) or a thankful note; it appears on the TV within a second. Photos live in the public `tg-photos` storage bucket (images only, 5 MB max) and the `tg_photos` table
- Presence: the countdown line shows how many others are on the page; opening a dish shows "Someone is signing up for this…" to everyone else

- Removal: each phone keeps a private key (database stores only its SHA-256 fingerprint); "Sent from this phone" on `add.html` removes your own posts via `tg_remove`
- Hosts' page (`admin.html`, unlocked by a private link): delete anything, "Delete & block" a phone (`tg_block`), unblock, and pause/reopen posting for everyone (`tg_set_posting`); new posts must pass `tg_can_post`

Shared settings live in `config.js`. `qrcode.js` is qrcode-generator 1.4.4 (MIT). Data lives in Supabase (`tg_dishes`, `tg_signups`, `tg_rsvps`, `tg_thanks`) and refreshes every few seconds.

Plain static HTML/CSS/JS, no build step. Hosted on GitHub Pages from the repo root.
