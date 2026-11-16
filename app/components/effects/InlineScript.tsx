"use client";

/**
 * Renders an inline script that executes synchronously during initial HTML
 * parsing (`type="text/javascript"` on the server) without triggering React's
 * client-render `<script>` warning (`type="text/plain"` on the client).
 */
export function InlineScript({ html }: { html: string }) {
  return (
    <script
      type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
