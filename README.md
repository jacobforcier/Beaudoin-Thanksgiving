# 🦃 Beaudoin Family Thanksgiving

Sign-up site for Thanksgiving: Thursday 11/26 at Danny & Barb's, 11 Chestnut Street, Wilmington, MA.

- Danny & Barb cover the turkey and Mémère's tourtière
- Suggested dishes (just suggestions); anyone can sign up for a dish, double up, or add their own
- RSVP with adult/kid counts (running total, no target)
- "Thankful For" quotes
- Add to Calendar (`thanksgiving.ics` or Google), directions, countdown, and Thanksgiving Day forecast (Open-Meteo)
- Under the invitation: "Thirteen at the table, and six dishes on it", a live "Still needed" list (tap to sign up), and a place card for each family
- Tap the title

Design: a printed menu card. Cormorant Garamond + EB Garamond, cream paper, brown-black ink, one cranberry accent, no emoji.

Data lives in Supabase (`tg_dishes`, `tg_signups`, `tg_rsvps`, `tg_thanks`) and refreshes every few seconds.

Plain static HTML/CSS/JS, no build step. Hosted on GitHub Pages from the repo root.
