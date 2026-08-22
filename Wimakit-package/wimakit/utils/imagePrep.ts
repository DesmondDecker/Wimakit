import { manipulateAsync, SaveFormat, Action } from 'expo-image-manipulator';

const MAX_DIMENSION = 1280;
const JPEG_QUALITY = 0.75;

/**
 * Resize (if needed) and re-compress a picked photo before it's added to a
 * FormData upload. Pass the source width/height from the ImagePicker asset
 * when available so this only downscales images that actually need it
 * (never upscales a smaller image). Falls back to the original URI on any
 * failure — a slow upload beats a broken one.
 */
export async function prepareImageForUpload(
  uri: string,
  sourceWidth?: number,
  sourceHeight?: number,
): Promise<string> {
  try {
    const actions: Action[] = [];
    const longestEdge = Math.max(sourceWidth ?? 0, sourceHeight ?? 0);
    if (longestEdge > MAX_DIMENSION) {
      const isPortrait = (sourceHeight ?? 0) > (sourceWidth ?? 0);
      actions.push({
        resize: isPortrait ? { height: MAX_DIMENSION } : { width: MAX_DIMENSION },
      });
    }
    const result = await manipulateAsync(
      uri,
      actions,
      { compress: JPEG_QUALITY, format: SaveFormat.JPEG },
    );
    return result.uri;
  } catch {
    return uri;
  }
}

/** Prepares a batch of picked photos in parallel. */
export async function prepareImagesForUpload(
  assets: Array<{ uri: string; width?: number; height?: number }>,
): Promise<string[]> {
  return Promise.all(assets.map((a) => prepareImageForUpload(a.uri, a.width, a.height)));
}
