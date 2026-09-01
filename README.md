# RT LAB Ready Pack — Production + V2 Bridge

## Structure

```text
index.html              Unified hub
booking.html            Booking app
lis.html                LIS production + V2 bridge
RT_LAB_*.html           Long names (same content)
js/                     V2 engines + lis-v2-bridge.js
v2/                     V2 demo screens (M2–M7)
001_rt_lab_v2_schema.sql  Optional Supabase M1 schema
```

## Architecture decision

- **Booking** and **LIS** stay separate UIs
- Shared Supabase when configured
- V2 engines power improved report / portal / AI / admin without merging apps

## LIS V2 buttons

On **النتائج المعتمدة والتقارير**:
- تقرير V2 STANDARD / PROFESSIONAL / PREMIUM
- إصدار بوابة V2
- AI اقتراح (يحتاج موافقة في v2/ai-center-v2.html)

## Deploy

Upload entire folder to GitHub Pages root (exact filenames, no -23).
