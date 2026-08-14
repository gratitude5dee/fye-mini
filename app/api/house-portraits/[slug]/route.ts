import { housePortraitSvg } from '../../../../src/config/house-portraits';

/**
 * Generated portrait plates for the immutable House seed shelf.
 *
 * User-created portraits stay in the R2-backed `/api/portraits` gallery.
 * These twelve first-party pages are deliberately generated as SVG so a fresh
 * deployment has complete, art-directed seed cards without a binary asset
 * bundle or a third-party image dependency.
 */
export async function GET(_request: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  const portrait = housePortraitSvg(slug.replace(/\.svg$/i, ''));
  if (!portrait) {
    return new Response('That House portrait has faded.', {
      status: 404,
      headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' }
    });
  }
  return new Response(portrait, {
    headers: {
      'content-type': 'image/svg+xml; charset=utf-8',
      'cache-control': 'public, max-age=31536000, immutable',
      'x-content-type-options': 'nosniff'
    }
  });
}
