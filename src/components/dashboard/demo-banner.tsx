import { Icon } from "@/components/ui/icon";

/**
 * DemoBanner â€” makes it unmistakable that the numbers on screen are fabricated
 * preview data, not real sales. Keeps the demo honest per the product rules.
 */
export function DemoBanner() {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm">
      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-warning text-warning-foreground">
        <Icon name="sparkles" size={15} />
      </span>
      <p className="text-foreground">
        <span className="font-semibold">ÙˆØ¶Ø¹ Ø§Ù„Ù…Ø¹Ø§ÙŠÙ†Ø©:</span> Ø¬Ù…ÙŠØ¹ Ø§Ù„Ø£Ø±Ù‚Ø§Ù… ÙˆØ§Ù„Ø·Ù„Ø¨Ø§Øª Ø£Ø¯Ù†Ø§Ù‡ Ø¨ÙŠØ§Ù†Ø§Øª ØªØ¬Ø±ÙŠØ¨ÙŠØ© Ù„Ù„ØªÙˆØ¶ÙŠØ­ ÙÙ‚Ø·ØŒ ÙˆÙ„ÙŠØ³Øª Ù…Ø¨ÙŠØ¹Ø§Øª Ø£Ùˆ Ø·Ù„Ø¨Ø§Øª Ø­Ù‚ÙŠÙ‚ÙŠØ©. Ø³ÙŠØªÙ… Ø±Ø¨Ø·Ù‡Ø§ Ø¨Ù‚Ø§Ø¹Ø¯Ø© Ø§Ù„Ø¨ÙŠØ§Ù†Ø§Øª Ù„Ø§Ø­Ù‚Ø§Ù‹.
      </p>
    </div>
  );
}

