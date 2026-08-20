# Private Atlas gateway

This process runs the existing server-side API on a host with a reserved public
egress IP. Cloudflare Tunnel exposes only its local HTTP listener to Sites;
the listener rejects every request except the database-backed Grimoire routes
and requires a shared server-side token.

## Required host environment

- `ATLAS_URI`: runtime user's TLS/SRV URI.
- `ATLAS_DB=living_grimoire`
- `OPENAI_API_KEY` and optional `OPENAI_MODEL=gpt-5.6`
- `BENDER_TOKEN_SECRET`: exactly the same 24+ character secret configured in Sites.
- `MONGO_GATEWAY_TOKEN`: a new random 32+ character secret, also configured in Sites.
- `LIVING_GRIMOIRE_GATEWAY=true`

The runtime Atlas user must have only `readWrite` on `living_grimoire`. Create
and use a separate, short-lived elevated user for bootstrap/index work.

## Network boundary

1. Put this process on a host/NAT with one reserved static EIP.
2. Allow only that EIP as `/32` in the Atlas project network access list.
3. Bind this process to `127.0.0.1`; do not open its port publicly.
4. Run `cloudflared` on the same host using `cloudflared-config.example.yml`.
5. Register the tunnel with Sites and deploy with the `mongo_gateway` private
   HTTP binding. Sites will then supply `CUSTOMER_HTTP_MONGO_GATEWAY`.

For the first week, retain the single EIP `/32` rule and review/remove it after
the event. A temporary Atlas allowlist expires in at most seven days, so it is
not a safe boundary for an "at least a week" commitment.

## Start

Build the project first, then run `node gateway/server.mjs`. The gateway starts
the application on an internal port and accepts tunnel traffic only on loopback.
It does not accept arbitrary MongoDB queries, collection names, or commands.
