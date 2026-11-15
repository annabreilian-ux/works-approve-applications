import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Works Approve Applications",
  description: "Review and approve council work applications.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full font-sans antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
