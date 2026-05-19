/**
 * Resolve a displayable user name from various backend and Supabase shapes.
 */
export const getUserDisplayName = (user, options = {}) => {
  const { fallbackToEmail = true } = options;

  const candidates = [
    user?.name,
    user?.fullName,
    user?.full_name,
    user?.displayName,
    user?.display_name,
    user?.nombre,
    user?.user_metadata?.name,
    user?.user_metadata?.full_name,
    user?.user_metadata?.fullName,
    user?.user_metadata?.display_name,
    user?.user_metadata?.displayName,
    user?.profile?.name,
    user?.profile?.full_name
  ];

  const resolved = candidates.find((value) => typeof value === 'string' && value.trim());
  if (resolved) return resolved.trim();

  if (fallbackToEmail && user?.email) {
    return String(user.email).split('@')[0];
  }

  return '';
};
