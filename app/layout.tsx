import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Glovo Live Ops Control Tower",
  description: "Real-time store performance dashboard",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="bg-slate-950 font-sans antialiased">{children}</body>
    </html>
  );
}
