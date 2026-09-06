import "./globals.css";

export const metadata = {
  title: "PoetryVerse — The World of Poetry",
  description: "Discover, save, create and share poetry with PoetryVerse.",
};

export default function RootLayout({ children }) {
  return <html lang="en"><body>{children}</body></html>;
}