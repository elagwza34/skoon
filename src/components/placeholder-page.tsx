import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import type { IconName } from "@/components/ui/icon";

/**
 * PlaceholderPage â€” honest "under construction" surface for routes that are
 * defined in navigation but not yet built. It never renders fake data or dead
 * buttons; it clearly states the screen is pending.
 */
export interface PlaceholderPageProps {
  title: string;
  icon: IconName;
  description: string;
}

export function PlaceholderPage({ title, icon, description }: PlaceholderPageProps) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-xl font-bold text-foreground">{title}</h2>
        <Badge tone="warning">Ù‚ÙŠØ¯ Ø§Ù„Ø¥Ù†Ø´Ø§Ø¡</Badge>
      </div>
      <p className="max-w-2xl text-sm text-muted-foreground">{description}</p>
      <EmptyState
        icon={icon}
        title="Ù‡Ø°Ù‡ Ø§Ù„Ø´Ø§Ø´Ø© Ù„Ù… ØªÙØ¨Ù†ÙŽ Ø¨Ø¹Ø¯"
        description="Ø³ØªØªÙ… Ø¥Ø¶Ø§ÙØªÙ‡Ø§ ÙÙŠ Ù…Ø±Ø­Ù„Ø© Ù„Ø§Ø­Ù‚Ø©. ÙŠÙ…ÙƒÙ†Ùƒ Ø§Ù„Ø§Ù†ØªÙ‚Ø§Ù„ Ù…Ù† Ø§Ù„Ù‚Ø§Ø¦Ù…Ø© Ø§Ù„Ø¬Ø§Ù†Ø¨ÙŠØ© Ø¥Ù„Ù‰ Ø§Ù„Ø´Ø§Ø´Ø§Øª Ø§Ù„Ø¬Ø§Ù‡Ø²Ø© (Ù„ÙˆØ­Ø© Ø§Ù„ØªØ­ÙƒÙ…ØŒ Ø§Ù„ÙƒØ§Ø´ÙŠØ±ØŒ Ø§Ù„Ù…Ø·Ø¨Ø®ØŒ Ø§Ù„Ø·Ù„Ø¨Ø§ØªØŒ Ø§Ù„Ø·Ø§ÙˆÙ„Ø§Øª)."
      />
    </div>
  );
}

