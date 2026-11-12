# Sky Watch v1

Live AR sky tracker: satellites, stars, constellations, planets, the Moon, meteor radiants and orbit events.

## Put it online (free, about 5 minutes)
The camera and motion sensors only work over https, so the app needs a real web address.

1. Make a GitHub account under a handle (no real name needed).
2. Create a new public repository, e.g. `skywatch`.
3. "Add file" → "Upload files" → drag in everything in this folder → Commit.
4. Settings → Pages → Source: "Deploy from a branch", Branch: `main`, folder `/ (root)` → Save.
5. After a minute it's live at `https://<your-handle>.github.io/skywatch/`.
6. Open that on your phone. Add it to your home screen (Share → Add to Home Screen on iPhone; ⋮ → Install app on Android) so it opens full screen.

## Using it
- **Start camera view** and allow camera, motion and location.
- Hold the phone flat for a second first so the compass locks on.
- **Align**: put the crosshair on a bright star or the Moon you can actually see and tap its circle. This removes compass error.
- Tap anything for details. Drag to look past the camera view; it snaps back when you let go. Pinch to zoom.
- Time slider: ±2 hours. Tap LIVE to return to now.
- The sun icon (top right) opens **Tonight**: passes, Starlink trains, launches, reentries, meteors, aurora.
- **Modes** (under the compass): Orbit, Deep space (galaxies, nebulae, clusters, Voyager, New Horizons, JWST) and Meteors (radiant, best place to look, auto-catch).
- **Star lock**: in camera view at night, bright stars in the image are used to correct the compass automatically.
- **Add to calendar** on any pass or meteor peak sets a phone reminder that works with the app closed.

Data: CelesTrak (orbits), The Space Devs (launches), NOAA SWPC (aurora). Orbit data is cached on the phone for offline use.

## Code layout
All files load in order from index.html and share one global scope:
`stars.js`, `deep.js` (catalog data), then `js/core.js` → `data.js` → `view.js` → `render.js` → `cards.js` → `sensing.js` → `ui.js` → `main.js`.
When releasing, bump the cache name in `sw.js` and the `?v=N` on the script tags.
