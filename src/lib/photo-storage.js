/**
 * Photo Storage — Supabase
 *
 * Photos uploaded to Supabase Storage (content-photos bucket).
 * Metadata stored in content_photos table.
 * Photos persist across devices, browsers, refreshes.
 *
 * The render service receives public URLs instead of base64 —
 * Puppeteer loads images from URLs directly in the HTML.
 */

import { supabase } from './supabase';

const BUCKET = 'content-photos';

/**
 * Get all photos for a business (metadata + public URLs).
 */
export async function getPhotos(bizId) {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from('content_photos')
      .select('*')
      .eq('biz_id', bizId)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });
    if (error) throw error;
    return data || [];
  } catch (e) {
    console.error('Failed to load photos:', e);
    return [];
  }
}

/**
 * Upload photos to Supabase Storage and save metadata.
 * @param {string} bizId - Business ID
 * @param {File[]} files - Array of File objects from input
 * @returns {Array} - Array of saved photo records
 */
export async function uploadPhotos(bizId, files) {
  if (!supabase) return [];
  const results = [];

  for (const file of files) {
    if (!file.type.startsWith('image/')) continue;

    // Generate unique storage path
    const ext = file.name.split('.').pop() || 'jpg';
    const path = `${bizId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

    // Upload to Storage
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(path, file, { cacheControl: '31536000', upsert: false });

    if (uploadError) {
      console.error('Upload failed:', file.name, uploadError);
      continue;
    }

    // Get public URL
    const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path);
    const public_url = urlData?.publicUrl || '';

    // Save metadata to table
    const { data: row, error: insertError } = await supabase
      .from('content_photos')
      .insert({
        biz_id: bizId,
        filename: file.name,
        storage_path: path,
        public_url,
        description: '',
        service_type: 'general',
        branding: '',
        best_use: '',
        phone_visible: false,
        mood: 'professional',
      })
      .select()
      .single();

    if (insertError) {
      console.error('Insert failed:', insertError);
      continue;
    }

    results.push(row);
  }

  return results;
}

/**
 * Update photo metadata (description, service_type, etc.)
 */
export async function updatePhoto(photoId, updates) {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from('content_photos')
      .update(updates)
      .eq('id', photoId)
      .select()
      .single();
    if (error) throw error;
    return data;
  } catch (e) {
    console.error('Update failed:', e);
    return null;
  }
}

/**
 * Delete a photo (removes from Storage and table).
 */
export async function deletePhoto(photoId, storagePath) {
  if (!supabase) return false;
  try {
    // Delete from Storage
    if (storagePath) {
      await supabase.storage.from(BUCKET).remove([storagePath]);
    }
    // Delete from table
    const { error } = await supabase
      .from('content_photos')
      .delete()
      .eq('id', photoId);
    if (error) throw error;
    return true;
  } catch (e) {
    console.error('Delete failed:', e);
    return false;
  }
}

/**
 * Get photo manifest for AI prompt (metadata only, no heavy data).
 */
export async function getPhotoManifestForAPI(bizId) {
  const photos = await getPhotos(bizId);
  return photos.map(({ id, filename, description, service_type, branding, best_use, phone_visible, mood, public_url }) => ({
    id, filename, description, service_type, branding, best_use, phone_visible, mood, public_url,
  }));
}