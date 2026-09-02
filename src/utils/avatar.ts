interface AvatarUser {
  avatar?: string | null
  avatarUrl?: string | null
}

export function resolveAvatarSource(user?: AvatarUser | null): string {
  const translatedUrl = String(user?.avatarUrl || '').trim()
  if (translatedUrl) return translatedUrl
  const rawAvatar = String(user?.avatar || '').trim()
  return /^(https?:\/\/|data:image\/|blob:)/i.test(rawAvatar) ? rawAvatar : ''
}
