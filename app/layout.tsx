import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import { Outfit, Unbounded } from 'next/font/google'
import './globals.css'

const _outfit = Outfit({ subsets: ['latin'] })
// Fonte display usada no título do vídeo (canvas) — precisa estar carregada na página
const _unbounded = Unbounded({ subsets: ['latin'], weight: ['600', '800'] })

export const metadata: Metadata = {
  title: 'KDISTRIBUTION — K-pop Line Distribution Maker',
  description:
    'Crie e exporte vídeos de K-pop Line Distribution direto do navegador, com barras animadas, ranking dinâmico e efeitos neon.',
  generator: 'v0.app',
  // Favicon dinâmico gerado por app/icon.tsx (ImageResponse)
}

export const viewport: Viewport = {
  colorScheme: 'dark',
  themeColor: '#0c0a12',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="pt-BR" className="dark bg-background">
      <body className="antialiased font-sans">
        {children}
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
