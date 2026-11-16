import { Icon, type IconName } from '@/components/ui/icon'

const names: Record<string, IconName> = {
  camera: 'camera', camera_alt: 'camera', music_video: 'music', music_note: 'music',
  favorite: 'heart', wifi: 'wifi', location_on: 'location', directions: 'location',
  chat: 'message', call: 'phone', schedule: 'clock', calendar_today: 'calendar',
  local_cafe: 'coffee', coffee: 'coffee', nightlight: 'moon', spa: 'sparkles',
  auto_awesome: 'sparkles', celebration: 'sparkles', casino: 'grid', groups: 'customers',
  thumb_up: 'check', verified: 'check', check_circle: 'check',
  qr_code_scanner: 'grid', restaurant_menu: 'utensils', expand_more: 'chevronDown',
  arrow_forward: 'chevronLeft', zoom_in: 'search', close: 'close',
  public: 'location', alternate_email: 'message',
}

/** Public decorative icons use the same local SVG family as staff controls. */
export function PublicIcon({ symbol, className }: { symbol: string; className?: string }) {
  return <Icon name={names[symbol] ?? 'sparkles'} size={24} className={className} />
}
