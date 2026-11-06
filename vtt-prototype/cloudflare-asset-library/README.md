# Wings of Atreia — Cloud Asset Library API

This Cloudflare Worker provides the authenticated API for the VTT's shared Asset Library.

## Resources to create in Cloudflare

1. Create an R2 bucket named woa-asset-library.
2. Create/import this Worker from the GitHub repository:
   - Repository: ArchQwynn/Wings-of-Atreia
   - Root directory: vtt-prototype/cloudflare-asset-library
   - Build command: leave blank
   - Deploy command: npx wrangler deploy
3. The Wrangler configuration binds the R2 bucket and allows the VTT origin https://archqwynn.github.io.
4. After the first deployment, open the Worker settings and add this secret:
   - Name: ASSET_LIBRARY_ACCESS_KEY
   - Value: a strong random access key of at least 24 characters. Prefer 32+ random characters.
5. Redeploy the Worker after adding the secret if Cloudflare does not automatically activate the new configuration.

The Worker URL will be shown in Cloudflare as a workers.dev URL. Enter that URL in the VTT Asset Library panel on each device, then enter the access key to connect.

## API behavior

- The access key is checked only by the Worker. The VTT stores a signed, time-limited GM token, not the access key itself.
- GM tokens expire after 30 days.
- All item listing, reading, writing, and deletion requires a valid GM token.
- R2 object data is private; the bucket must not be made public.
- The Worker enforces a 5 GiB total library limit and an 8 MiB maximum per saved template.
- The browser's old IndexedDB library remains as a local backup and can be imported into the cloud library.
- The Worker only accepts browser requests from https://archqwynn.github.io.

## Deployment through Cloudflare Workers Builds

In Cloudflare, choose Workers & Pages, then Create application, then Connect to Git. Select this repository and configure the root directory as shown above. Workers Builds can deploy the Worker from the connected Git repository on subsequent pushes.

Do not put the access key in GitHub, source files, wrangler.jsonc, or the public VTT JavaScript.
