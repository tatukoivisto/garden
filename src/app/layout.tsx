import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Kitchen Garden Planner",
    template: "%s | Kitchen Garden Planner",
  },
  description:
    "Plan, track, and grow your kitchen garden with AI-powered planting advice, companion planting suggestions, and seasonal scheduling.",
  keywords: [
    "kitchen garden",
    "vegetable garden planner",
    "companion planting",
    "grow your own",
    "AI garden assistant",
    "planting calendar",
  ],
  authors: [{ name: "Kitchen Garden Planner" }],
  creator: "Kitchen Garden Planner",
  metadataBase: new URL("https://kitchen-garden-planner.vercel.app"),
  openGraph: {
    type: "website",
    locale: "en_US",
    title: "Kitchen Garden Planner",
    description:
      "Plan, track, and grow your kitchen garden with AI-powered planting advice.",
    siteName: "Kitchen Garden Planner",
  },
  twitter: {
    card: "summary_large_image",
    title: "Kitchen Garden Planner",
    description:
      "Plan, track, and grow your kitchen garden with AI-powered planting advice.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-garden-cream font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
