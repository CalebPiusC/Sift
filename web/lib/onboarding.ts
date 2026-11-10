export const businessTypes = ['products', 'services', 'made-to-order', 'mixed'] as const;
export const tones = ['friendly', 'professional', 'Pidgin-friendly'] as const;
export type Profile = {
  business_name: string;
  business_type: (typeof businessTypes)[number];
  tone: (typeof tones)[number];
};
export function validName(name: string) {
  return name.trim().length >= 2 && name.trim().length <= 80;
}
export async function saveProfile(profile: Profile) {
  const { supabase } = await import('./supabase');
  const { data, error } = await supabase().rpc('onboard_vendor', {
    p_name: profile.business_name.trim(),
    p_type: profile.business_type,
    p_tone: profile.tone,
  });
  if (error) throw error;
  return data as string;
}
