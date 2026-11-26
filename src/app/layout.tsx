import type { Metadata } from "next";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";
export const metadata: Metadata = { title: { default: "FarmSave Africa — Less Waste, More Income", template: "%s | FarmSave Africa" }, description: "Smart post-harvest management and agricultural market linkage. From Harvest to Market — Less Waste, More Income." };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" suppressHydrationWarning><body><ThemeProvider><a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-card focus:p-4">Skip to content</a>{children}</ThemeProvider></body></html>;
}
