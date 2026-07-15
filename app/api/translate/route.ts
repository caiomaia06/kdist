import { generateText, Output } from 'ai'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

export const maxDuration = 30

const resultSchema = z.object({
  romanized: z.string().describe('Romanização (letras latinas) da letra em coreano'),
  translation: z.string().describe('Tradução da letra para o português do Brasil'),
})

export async function POST(request: Request) {
  // Apenas usuários autenticados podem usar a tradução
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return Response.json({ error: 'Não autenticado' }, { status: 401 })
  }

  const body = (await request.json().catch(() => null)) as { text?: string } | null
  const text = body?.text?.trim()
  if (!text || text.length > 300) {
    return Response.json({ error: 'Texto inválido' }, { status: 400 })
  }

  try {
    const { output } = await generateText({
      model: 'google/gemini-3.5-flash',
      output: Output.object({ schema: resultSchema }),
      prompt: [
        'Você é um especialista em K-pop. Para o trecho de letra abaixo (geralmente em coreano/Hangul, mas pode misturar inglês):',
        '1. "romanized": a romanização padrão (Revised Romanization). Palavras já em inglês ficam como estão.',
        '2. "translation": a tradução natural para o português do Brasil, curta e fiel ao sentido.',
        '',
        `Letra: ${text}`,
      ].join('\n'),
    })
    return Response.json(output)
  } catch (e) {
    console.error('Falha na tradução automática', e)
    return Response.json({ error: 'Falha ao traduzir' }, { status: 500 })
  }
}
