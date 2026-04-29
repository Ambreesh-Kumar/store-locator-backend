require("dotenv").config();
const express = require("express");
const cors = require("cors");
const fs = require("fs");
const csv = require("csv-parser");

const app = express();
app.use(cors({
  origin: "*", // later replace with frontend URL
}));

// State centroids
const STATE_CENTROIDS = {
  alabama: { abbr: "AL", lat: 32.806671, lng: -86.79113 },
  alaska: { abbr: "AK", lat: 61.370716, lng: -152.404419 },
  arizona: { abbr: "AZ", lat: 33.729759, lng: -111.431221 },
  arkansas: { abbr: "AR", lat: 34.969704, lng: -92.373123 },
  california: { abbr: "CA", lat: 36.116203, lng: -119.681564 },
  colorado: { abbr: "CO", lat: 39.059811, lng: -105.311104 },
  connecticut: { abbr: "CT", lat: 41.597782, lng: -72.755371 },
  delaware: { abbr: "DE", lat: 39.318523, lng: -75.507141 },
  florida: { abbr: "FL", lat: 27.766279, lng: -81.686783 },
  georgia: { abbr: "GA", lat: 33.040619, lng: -83.643074 },
  hawaii: { abbr: "HI", lat: 21.094318, lng: -157.498337 },
  idaho: { abbr: "ID", lat: 44.240459, lng: -114.478828 },
  illinois: { abbr: "IL", lat: 40.349457, lng: -88.986137 },
  indiana: { abbr: "IN", lat: 39.849426, lng: -86.258278 },
  iowa: { abbr: "IA", lat: 42.011539, lng: -93.210526 },
  kansas: { abbr: "KS", lat: 38.5266, lng: -96.726486 },
  kentucky: { abbr: "KY", lat: 37.66814, lng: -84.670067 },
  louisiana: { abbr: "LA", lat: 31.16996, lng: -91.867805 },
  maine: { abbr: "ME", lat: 44.693947, lng: -69.381927 },
  maryland: { abbr: "MD", lat: 39.063946, lng: -76.802101 },
  massachusetts: { abbr: "MA", lat: 42.230171, lng: -71.530106 },
  michigan: { abbr: "MI", lat: 43.326618, lng: -84.536095 },
  minnesota: { abbr: "MN", lat: 45.694454, lng: -93.900192 },
  mississippi: { abbr: "MS", lat: 32.741646, lng: -89.678696 },
  missouri: { abbr: "MO", lat: 38.456085, lng: -92.288368 },
  montana: { abbr: "MT", lat: 46.921925, lng: -110.454353 },
  nebraska: { abbr: "NE", lat: 41.12537, lng: -98.268082 },
  nevada: { abbr: "NV", lat: 38.313515, lng: -117.055374 },
  "new hampshire": { abbr: "NH", lat: 43.452492, lng: -71.563896 },
  "new jersey": { abbr: "NJ", lat: 40.298904, lng: -74.521011 },
  "new mexico": { abbr: "NM", lat: 34.840515, lng: -106.248482 },
  "new york": { abbr: "NY", lat: 42.165726, lng: -74.948051 },
  "north carolina": { abbr: "NC", lat: 35.630066, lng: -79.806419 },
  "north dakota": { abbr: "ND", lat: 47.528912, lng: -99.784012 },
  ohio: { abbr: "OH", lat: 40.388783, lng: -82.764915 },
  oklahoma: { abbr: "OK", lat: 35.565342, lng: -96.928917 },
  oregon: { abbr: "OR", lat: 44.572021, lng: -122.070938 },
  pennsylvania: { abbr: "PA", lat: 40.590752, lng: -77.209755 },
  "rhode island": { abbr: "RI", lat: 41.680893, lng: -71.51178 },
  "south carolina": { abbr: "SC", lat: 33.856892, lng: -80.945007 },
  "south dakota": { abbr: "SD", lat: 44.299782, lng: -99.438828 },
  tennessee: { abbr: "TN", lat: 35.747845, lng: -86.692345 },
  texas: { abbr: "TX", lat: 31.054487, lng: -97.563461 },
  utah: { abbr: "UT", lat: 40.150032, lng: -111.862434 },
  vermont: { abbr: "VT", lat: 44.045876, lng: -72.710686 },
  virginia: { abbr: "VA", lat: 37.769337, lng: -78.169968 },
  washington: { abbr: "WA", lat: 47.400902, lng: -121.490494 },
  "west virginia": { abbr: "WV", lat: 38.491226, lng: -80.954453 },
  wisconsin: { abbr: "WI", lat: 44.268543, lng: -89.616508 },
  wyoming: { abbr: "WY", lat: 42.755966, lng: -107.30249 },
  "district of columbia": { abbr: "DC", lat: 38.897438, lng: -77.026817 },
  "puerto rico": { abbr: "PR", lat: 18.220833, lng: -66.590149 },
  guam: { abbr: "GU", lat: 13.444304, lng: 144.793731 },
  "virgin islands": { abbr: "VI", lat: 18.335765, lng: -64.896335 },
  "american samoa": { abbr: "AS", lat: -14.270972, lng: -170.132217 },
};

// In-memory store data
let stores = [];
let stateAggregates = {};

function formatCount(n) {
  if (n >= 1_000_000)
    return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "k";
  return String(n);
}

// Load CSV
fs.createReadStream("stores.csv")
  .pipe(csv())
  .on("data", (row) => {
    const lat = parseFloat(row.latitude);
    const lng = parseFloat(row.longitude);
    if (isNaN(lat) || isNaN(lng)) return;
    stores.push({
      id: row.id,
      brand: (row.brand_name || row.brand_initial || "?").trim(),
      lat,
      lng,
      state: (row.state || "").toLowerCase().trim(),
      city: (row.city || "").trim(),
      status: (row.status || "Unknown").trim(),
    });
  })
  .on("end", () => {
    console.log(` CSV Loaded: ${stores.length} stores`);

    // Pre-compute per-state counts using real centroids
    const stateCounts = {};
    for (const s of stores) {
      stateCounts[s.state] = (stateCounts[s.state] || 0) + 1;
    }

    for (const [name, count] of Object.entries(stateCounts)) {
      const c = STATE_CENTROIDS[name];
      if (!c) {
        console.warn(` No centroid for: "${name}" (${count} stores)`);
        continue;
      }
      stateAggregates[name] = {
        state: name,
        abbr: c.abbr,
        lat: c.lat,
        lng: c.lng,
        count,
        label: `${c.abbr} ${formatCount(count)}`,
      };
    }

    console.log(
      ` State aggregates built: ${Object.keys(stateAggregates).length} states`,
    );
    const sample = Object.values(stateAggregates).slice(0, 3);
    sample.forEach((s) =>
      console.log(
        `   sample → ${s.abbr} lat=${s.lat} lng=${s.lng} count=${s.count}`,
      ),
    );
  });

// Bounds helpers
function lngInBounds(lng, swLng, neLng) {
  // Handle antimeridian crossing (e.g. Pacific view where swLng > neLng)
  if (swLng <= neLng) return lng >= swLng && lng <= neLng;
  return lng >= swLng || lng <= neLng;
}

function pointInBounds(lat, lng, neLat, neLng, swLat, swLng) {
  return lat >= swLat && lat <= neLat && lngInBounds(lng, swLng, neLng);
}

// Tier 1: State markers
function getStateData(neLat, neLng, swLat, swLng) {
  const all = Object.values(stateAggregates);
  const inView = all.filter((s) =>
    pointInBounds(s.lat, s.lng, neLat, neLng, swLat, swLng),
  );

  // Fallback: if bounds missed everything (first render edge case), return all
  if (inView.length === 0 && all.length > 0) {
    console.warn(`  ⚠ Bounds hit nothing — returning all states as fallback`);
    return all;
  }
  return inView;
}

// Tier 2: Adaptive grid clustering
function getClusters(filtered, zoom) {
  const gridStep =
    zoom <= 5
      ? 2.0
      : zoom <= 6
        ? 1.0
        : zoom <= 7
          ? 0.5
          : zoom <= 8
            ? 0.25
            : 0.1;

  const cells = {};
  for (const s of filtered) {
    const row = Math.floor(s.lat / gridStep);
    const col = Math.floor(s.lng / gridStep);
    const key = `${row}:${col}`;
    if (!cells[key]) cells[key] = { count: 0, latSum: 0, lngSum: 0 };
    cells[key].count++;
    cells[key].latSum += s.lat;
    cells[key].lngSum += s.lng;
  }

  return Object.values(cells).map((c) => ({
    lat: c.latSum / c.count,
    lng: c.lngSum / c.count,
    count: c.count,
    label: formatCount(c.count),
  }));
}

// Routes
app.get("/", (_req, res) =>
  res.send(
    ` Running | ${stores.length} stores | ${Object.keys(stateAggregates).length} states`,
  ),
);

app.get("/config", (_req, res) => {
  const key = process.env.GOOGLE_MAP_API_KEY || "";
  if (!key) console.error(" GOOGLE_MAP_API_KEY not set in .env!");
  res.json({ googleMapsApiKey: key });
});

app.get("/stores", (req, res) => {
  const { neLat, neLng, swLat, swLng, zoom } = req.query;

  if (!neLat || !neLng || !swLat || !swLng || !zoom) {
    return res
      .status(400)
      .json({ error: "Missing params: neLat, neLng, swLat, swLng, zoom" });
  }

  const ne_lat = parseFloat(neLat);
  const ne_lng = parseFloat(neLng);
  const sw_lat = parseFloat(swLat);
  const sw_lng = parseFloat(swLng);
  const z = parseInt(zoom);

  if ([ne_lat, ne_lng, sw_lat, sw_lng].some(isNaN)) {
    return res.status(400).json({ error: "Bounds contain NaN" });
  }

  console.log(
    ` zoom=${z} | SW(${sw_lat.toFixed(2)}, ${sw_lng.toFixed(2)}) → NE(${ne_lat.toFixed(2)}, ${ne_lng.toFixed(2)})`,
  );

  // Tier 1 — country view
  if (z <= 5) {
    const data = getStateData(ne_lat, ne_lng, sw_lat, sw_lng);
    console.log(`  [Tier 1] → ${data.length} states`);
    return res.json({ type: "state", data });
  }

  // Filter viewport for tiers 2 & 3
  const filtered = stores.filter((s) =>
    pointInBounds(s.lat, s.lng, ne_lat, ne_lng, sw_lat, sw_lng),
  );

  // Tier 2 — regional clusters
  if (z <= 9) {
    const data = getClusters(filtered, z);
    console.log(
      `  [Tier 2] → ${filtered.length} stores → ${data.length} clusters`,
    );
    return res.json({ type: "cluster", data });
  }

  // Tier 3 — individual stores
  const data = filtered.slice(0, 500);
  console.log(`  [Tier 3] → ${data.length} stores`);
  return res.json({ type: "store", data });
});

// Start
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server on http://localhost:${PORT}`));
