import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * The bucket the operator created for platform imagery. Capitalised because
 * that is the bucket's actual name in this project, and Storage paths are
 * case-sensitive.
 */
export const BRANDING_BUCKET = 'Images'

/**
 * How long a signed URL lasts while the bucket is private.
 *
 * An hour, not a day: the URL is minted per render and ends up in the HTML, so
 * a short life limits how long a copied page source keeps working, while still
 * outliving any single visit.
 */
const SIGNED_URL_TTL_SECONDS = 60 * 60

export interface BrandingAssetRepository {
  /** Uploads (or replaces) an object and returns the path it was stored at. */
  upload(path: string, body: Buffer, contentType: string): Promise<string>
  remove(path: string): Promise<void>
  /**
   * A URL a browser can load: the public one when the bucket is public, a
   * signed one while it is private. Null when the object cannot be reached at
   * all, so the caller falls back to the built-in mark rather than emitting a
   * broken image.
   */
  resolveUrl(path: string): Promise<string | null>
}

/**
 * Requires the service-role client: this bucket has no anon write access, and
 * signing requires the same key.
 */
export function createBrandingAssetRepository(client: SupabaseClient): BrandingAssetRepository {
  const bucket = client.storage.from(BRANDING_BUCKET)

  // Whether the bucket is public decides between two different URL shapes, and
  // it changes about never, so it is asked once per server process.
  let isPublic: boolean | null = null

  async function bucketIsPublic(): Promise<boolean> {
    if (isPublic !== null) return isPublic
    try {
      const { data, error } = await client.storage.getBucket(BRANDING_BUCKET)
      if (error) throw error
      isPublic = data?.public === true
    } catch (err) {
      // Assume private: a signed URL works either way, where a public URL
      // against a private bucket would simply 400 for every visitor.
      console.warn('[branding] could not read bucket settings, assuming private:', err)
      isPublic = false
    }
    return isPublic
  }

  return {
    async upload(path, body, contentType) {
      console.log(`[branding-asset] uploading to bucket '${BRANDING_BUCKET}', path: ${path}`)
      const { data, error } = await bucket.upload(path, body, {
        contentType,
        upsert: true,
        cacheControl: '3600'
      })
      if (error) {
        console.error(`[branding-asset] upload failed:`, error)
        throw error
      }
      console.log(`[branding-asset] upload succeeded:`, data)
      return path
    },

    async remove(path) {
      const { error } = await bucket.remove([path])
      // A missing object is the desired end state, not a failure worth raising.
      if (error) console.warn(`[branding] could not remove '${path}':`, error.message)
    },

    async resolveUrl(path) {
      const isPublicBucket = await bucketIsPublic()
      console.log(`[branding-asset] resolving URL for '${path}', bucket public: ${isPublicBucket}`)

      if (isPublicBucket) {
        const url = bucket.getPublicUrl(path).data.publicUrl ?? null
        console.log(`[branding-asset] public URL: ${url}`)
        return url
      }

      const { data, error } = await bucket.createSignedUrl(path, SIGNED_URL_TTL_SECONDS)
      if (error) {
        console.error(`[branding-asset] could not sign '${path}':`, error)
        return null
      }
      console.log(`[branding-asset] signed URL generated for '${path}'`)
      return data?.signedUrl ?? null
    }
  }
}
