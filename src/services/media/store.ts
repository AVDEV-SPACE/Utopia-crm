import { del } from '@vercel/blob';
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { MEDIA_LIMITS, kindFromPathname } from './limits';

/**
 * Stocarea fișierelor media (Adapter). Meta descarcă imaginile și video-urile
 * de la un URL public, deci fișierele stau într-un store public; restul
 * aplicației lucrează doar cu interfața de mai jos.
 *
 * Implementarea curentă: Vercel Blob. Browserul încarcă direct în Blob (fără
 * să treacă fișierul prin funcție) cu un token scurt emis de `handleClientUpload`.
 */
export interface MediaStore {
  readonly configured: boolean;
  /** Protocolul de upload din browser: emite tokenul pentru o cale `socials/{image|video}/...`. */
  handleClientUpload(request: Request, body: unknown): Promise<unknown>;
  /** URL-ul aparține store-ului nostru (nu acceptăm în bibliotecă URL-uri străine). */
  owns(url: string): boolean;
  remove(url: string): Promise<void>;
}

const BLOB_HOST = /^[a-z0-9]+\.public\.blob\.vercel-storage\.com$/i;

const vercelBlobStore: MediaStore = {
  get configured() {
    return Boolean(process.env.BLOB_READ_WRITE_TOKEN?.trim());
  },

  handleClientUpload(request, body) {
    return handleUpload({
      request,
      body: body as HandleUploadBody,
      onBeforeGenerateToken: async (pathname) => {
        const kind = kindFromPathname(pathname);
        if (!kind) throw new Error('Cale de upload invalidă');
        return {
          allowedContentTypes: MEDIA_LIMITS[kind].types,
          maximumSizeInBytes: MEDIA_LIMITS[kind].maxBytes,
          addRandomSuffix: true,
        };
      },
    });
  },

  owns(url) {
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'https:' && BLOB_HOST.test(parsed.hostname);
    } catch {
      return false;
    }
  },

  remove(url) {
    return del(url);
  },
};

export function mediaStore(): MediaStore {
  return vercelBlobStore;
}
