import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Apuntes IA · Generador de apuntes dinámicos",
  description:
    "Convierte materiales docentes (PPTX, DOCX, PDF, MD) en apuntes estructurados con tablas, ideas clave y preguntas de repaso.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}