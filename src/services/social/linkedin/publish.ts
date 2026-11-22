import { sleep } from '@/services/engine/http';
import { socialOrgId } from '../config';
import type { PostMediaItem } from '../post-rules';
import { encodeUrn, linkedin, LinkedInError, uploadBinary } from './api';
import { getAccessToken } from './tokens';

/**
 * Publicarea pe pagina de companie LinkedIn (Posts API + Images API):
 * text, o imagine sau mai multe imagini (2–20, „multiImage”).
 * Video-ul nu e suportat încă (Videos API cere upload pe bucăți).
 */

/** Cât așteptăm procesarea unei imagini (de regulă câteva secunde). */
const IMAGE_READY_TIMEOUT_MS = 45_000;
/** Limita de text a unei postări LinkedIn. */
export const LINKEDIN_POST_MAX_CHARS = 3000;

/**
 * Textul în „little text format”: caracterele rezervate se escapează cu `\`,
 * altfel LinkedIn respinge postarea sau taie textul. `#cuvânt` rămâne hashtag.
 */
export function toLittleText(text: string): string {
  return text
    .replace(/[\\|{}@[\]()<>*_~]/g, '\\$&')
    .replace(/#(?![\p{L}\p{N}])/gu, '\\#');
}

async function orgToken(): Promise<{ token: string; organizationUrn: string }> {
  const orgId = socialOrgId();
  if (!orgId) throw new LinkedInError('SOCIAL_ORG_ID nu este setat', 500, null);
  return getAccessToken(orgId);
}

/** Încarcă o imagine din biblioteca media și întoarce URN-ul ei, gata de folosit. */
async function uploadImage(token: string, organizationUrn: string, url: string): Promise<string> {
  const source = await fetch(url, { signal: AbortSignal.timeout(30_000), cache: 'no-store' });
  if (!source.ok) throw new LinkedInError(`Imaginea nu a putut fi descărcată (${source.status})`, 502, null);
  const bytes = await source.arrayBuffer();
  const contentType = source.headers.get('content-type') ?? 'image/jpeg';

  const { data } = await linkedin<{ value?: { uploadUrl?: string; image?: string } }>('images', {
    token,
    method: 'POST',
    query: 'action=initializeUpload',
    body: { initializeUploadRequest: { owner: organizationUrn } },
  });
  const uploadUrl = data.value?.uploadUrl;
  const image = data.value?.image;
  if (!uploadUrl || !image) throw new LinkedInError('LinkedIn nu a întors URL-ul de upload', 502, null);

  await uploadBinary(uploadUrl, token, bytes, contentType);

  const deadline = Date.now() + IMAGE_READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const { data: info } = await linkedin<{ status?: string }>(`images/${encodeUrn(image)}`, { token });
    if (info.status === 'AVAILABLE') return image;
    if (info.status === 'PROCESSING_FAILED') throw new LinkedInError('LinkedIn nu a putut procesa imaginea', 422, null);
    await sleep(2_000);
  }
  throw new LinkedInError('Procesarea imaginii pe LinkedIn a durat prea mult', 504, null);
}

/** Publică postarea; întoarce URN-ul postării (`urn:li:share:…` / `urn:li:ugcPost:…`). */
export async function publishLinkedInPost(caption: string, media: PostMediaItem[]): Promise<string> {
  const { token, organizationUrn } = await orgToken();
  if (media.some((m) => m.kind === 'video')) throw new LinkedInError('Video-ul nu e suportat încă pe LinkedIn', 422, null);

  const images: string[] = [];
  for (const item of media) images.push(await uploadImage(token, organizationUrn, item.url));

  const content =
    images.length === 0
      ? undefined
      : images.length === 1
        ? { media: { id: images[0] } }
        : { multiImage: { images: images.map((id) => ({ id })) } };

  const { restliId } = await linkedin<unknown>('posts', {
    token,
    method: 'POST',
    body: {
      author: organizationUrn,
      commentary: toLittleText(caption.slice(0, LINKEDIN_POST_MAX_CHARS)),
      visibility: 'PUBLIC',
      distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] },
      ...(content ? { content } : {}),
      lifecycleState: 'PUBLISHED',
      isReshareDisabledByAuthor: false,
    },
    timeoutMs: 30_000,
  });
  if (!restliId) throw new LinkedInError('LinkedIn nu a întors id-ul postării', 502, null);
  return restliId;
}
