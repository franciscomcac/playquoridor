# coil.io — snake .io game with proximity voice chat

## Run locally
    npm install
    npm start            # http://localhost:3000

Env vars:
- `PORT` (default 3000)
- `BOTS` (default 30): bots fill the world up to this many snakes; one bot leaves for every real player who joins
- `BOTS_MIN` (default 8): never fewer bots than this, however many players are on
- `START_SCORE` (default 10): starting length for players (handy for testing)

## Bots
Bots spawn at mixed sizes (big ones start coiled up) with player-style names, and each one gets a personality:
- **farmer**: eats, avoids fights, boosts for big food, and sometimes picks off much smaller snakes
- **hunter**: chases smaller snakes (it prefers real players), cuts in front of their heads, and circles around ones much smaller than itself
- **coward**: eats, but boosts away from anything bigger that gets close

Each bot also has a skill level that controls how far ahead it looks, so some are easy to kill and some are not.

## How voice works
- Tick "Proximity voice chat" before pressing Play (your browser asks for the mic).
- When another voice-enabled player is within ~1100 world units, a direct WebRTC
  audio link opens. Volume fades with distance and is panned left/right by where
  they are on screen. The link closes past ~1350 units.
- M = mute. If you block the mic you can still listen.
- Green ring around a head = that player is talking.

## Deploying
- The mic only works over HTTPS (or on localhost), so host it behind TLS.
- You need a host that keeps WebSockets open: Render, Railway, Fly.io or a VPS.
  Vercel and other serverless hosts won't work.
- Uses Google's public STUN servers. Players behind strict NATs will need a TURN
  server (e.g. coturn, Twilio or Metered); add it to `ICE` in public/index.html.
