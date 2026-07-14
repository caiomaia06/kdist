import Link from 'next/link'
import { TriangleAlert } from 'lucide-react'

export default async function AuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const params = await searchParams

  return (
    <main className="flex min-h-svh w-full items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-6 text-center">
        <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-destructive/15 text-destructive">
          <TriangleAlert className="size-6" aria-hidden="true" />
        </span>
        <h1 className="mt-4 text-lg font-semibold">Algo deu errado</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {params?.error ? `Erro: ${params.error}` : 'Ocorreu um erro não especificado.'}
        </p>
        <Link
          href="/auth/login"
          className="mt-5 inline-block text-sm text-primary underline underline-offset-4"
        >
          Voltar para o login
        </Link>
      </div>
    </main>
  )
}
