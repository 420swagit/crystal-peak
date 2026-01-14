# Crystal Peak (Crystal Mountain, WA)

This repo contains **one** Node/Express app that:

- Serves a **React frontend** (after you build it)
- Provides a JSON API at **/api/state**

The frontend reads live data from that API, so it works as a single deployed site.

---

## What data is "live"?

- **NWS forecast** (via api.weather.gov)
- **WSDOT** cameras + pass reports + WSDOT weather stations (requires WSDOT access code)
- **Avalanche** forecast (via avalanche.org public API)

If a data source is unavailable (missing API key, etc.), the UI hides the related sections automatically.

---

## Required environment variables

Set these in your host (Render/Railway/etc.) as **Environment Variables**:

- `WSDOT_ACCESS_CODE` (required for cameras/roads/WSDOT weather)
- `NWS_USER_AGENT` (recommended: include contact email)

Optional:

- `CRYSTAL_LAT` and `CRYSTAL_LON` (defaults included)

---

## Local run (optional)

If you *do* have Node installed:

```bash
npm install
npm run build
npm start
```

Then open:

- http://localhost:3000 (website)
- http://localhost:3000/api/state (API)

---

## Deployment (Render)

1. Create a GitHub repo and upload this project.
2. In Render, create a **New Web Service** from that repo.
3. Set:
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`
4. Add environment variables (`WSDOT_ACCESS_CODE`, `NWS_USER_AGENT`).
5. Deploy.

