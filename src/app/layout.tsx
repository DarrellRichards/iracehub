import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AuthProvider } from "@/components/AuthProvider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "iRaceHub — Race Points Manager",
  description: "The ultimate iRacing race points manager system.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const currentYear = new Date().getFullYear();

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <AuthProvider>
          <div className="flex min-h-full flex-col">
            <div className="flex-1">{children}</div>
            <footer className="border-t border-zinc-800 bg-zinc-950 py-6 text-center text-sm text-zinc-400">
              <div className="mx-auto max-w-6xl px-6">
                © {currentYear} iRaceHub - Made with ♥ by{" "}
                <a
                  href="https://github.com/DarrellRichards"
                  target="_blank"
                  rel="noreferrer"
                  className="font-semibold text-white transition-colors hover:text-red-400"
                >
                  Darrell Richards
                </a>
              </div>
            </footer>
          </div>
        </AuthProvider>
      </body>
    </html>
  );
}
