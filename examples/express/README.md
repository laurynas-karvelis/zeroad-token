# Express example

A minimal publisher integration with `@zeroad.network/token`: one middleware that announces the site
and verifies the visitor's token, and a page that renders differently for subscribers.

## Run it

```shell
npm install && npm start
```

Then open http://localhost:8080.

Set `ZERO_AD_PUBLISHER_ID` and `ZERO_AD_HOSTNAMES` (comma separated) to use your own publisher ID.

## What to look at

`index.js` is about sixty lines, and the parts that matter are:

1. `createPublisher()` at module scope - once per process, never per request.
2. The middleware, which does exactly two things: sets `Better-Web-Publisher` on the response, and
   verifies `Better-Web-Token` from the request.
3. `visitor.subscriber` deciding what the page renders.

## Routes

| Route | |
| :-- | :-- |
| `GET /` | Homepage. Shows an ad and a paywall to ordinary visitors, neither to subscribers. |
| `GET /api/premium-data` | 403 unless the visitor holds a subscription. |
| `GET /internal/token-cache` | Cache statistics. Handy while tuning; do not expose publicly. |

## Without a real token

Every visit will come back `{ subscriber: false, reason: "missing" }` until a browser with the Zero Ad
Network extension and a live subscription visits. That is the expected state for most traffic - the
site should behave exactly as it always did.
