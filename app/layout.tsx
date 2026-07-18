import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import { Archivo_Black, Inter, Outfit, Playfair_Display, Unbounded } from 'next/font/google'
import './globals.css'

const _outfit = Outfit({ subsets: ['latin'] })
// Fonte display usada no título do vídeo (canvas) — precisa estar carregada na página
const _unbounded = Unbounded({ subsets: ['latin'], weight: ['600', '800'] })
// Fonte da opção 'Sans-Serif Moderna' da aba Design (canvas)
const _inter = Inter({ subsets: ['latin'] })
// Fontes dos Temas de Interface: serifada delicada (Photocard) e pesada (Comeback)
const playfair = Playfair_Display({ subsets: ['latin'], variable: '--font-playfair' })
const archivoBlack = Archivo_Black({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-archivo-black',
})

// Aplica o tema salvo ANTES da primeira pintura (evita flash do tema errado)
const themeInitScript = `try{var t=localStorage.getItem('kdist-ui-theme');if(t==='concert'||t==='photocard'||t==='studio'||t==='comeback'){document.documentElement.dataset.theme=t}}catch(e){}`

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
    <html
      lang="pt-BR"
      data-theme="concert"
      className={`dark bg-background ${playfair.variable} ${archivoBlack.variable}`}
    >
      <body className="antialiased font-sans">
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        {children}
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
