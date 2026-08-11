import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Paper Plane Quiz - Lecture AI Quiz",
  description: "Turn course PDFs into concise quizzes with answers and explanations.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
