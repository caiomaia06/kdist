import Link from 'next/link'
import { MailCheck } from 'lucide-react'

export default function SignUpSuccessPage() {
  return (
    <main className="flex min-h-svh w-full items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-6 text-center">
        <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary/15 text-primary">
          <MailCheck className="size-6" aria-hidden="true" />
        </span>
        <h1 className="mt-4 text-lg font-semibold">Confirme seu email</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Enviamos um link de confirmação para o seu email. Clique nele para ativar sua conta e
          depois faça login.
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
