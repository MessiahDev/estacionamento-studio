import { useState } from 'react'
import { neon } from './neon'

export default function Login() {
  const [mode, setMode] = useState('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function submit(event) {
    event.preventDefault()
    setLoading(true)
    setError('')

    try {
      const result = mode === 'login'
        ? await neon.auth.signIn.email({ email, password })
        : await neon.auth.signUp.email({ name, email, password })

      if (result?.error) throw result.error
    } catch (err) {
      console.error(err)
      setError(mode === 'login' ? 'Não foi possível entrar.' : 'Não foi possível criar a conta.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-2xl bg-white p-6 shadow">
        <div>
          <h1 className="text-2xl font-bold">Estacionamento Studio</h1>
          <p className="text-sm text-slate-500">{mode === 'login' ? 'Entre na sua conta' : 'Criar uma conta'}</p>
        </div>

        {mode === 'register' && (
          <input value={name} onChange={e => setName(e.target.value)} placeholder="NOME" required className="w-full rounded-xl border p-4 uppercase" />
        )}

        <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="E-MAIL" required className="w-full rounded-xl border p-4" />

        <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="SENHA" required minLength={8} className="w-full rounded-xl border p-4" />

        {error && <div className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</div>}

        <button disabled={loading} className="w-full rounded-xl bg-slate-950 p-4 font-bold text-white disabled:opacity-50">
          {loading ? 'Aguarde...' : mode === 'login' ? 'Entrar' : 'Criar conta'}
        </button>

        <button type="button" onClick={() => setMode(mode === 'login' ? 'register' : 'login')} className="w-full rounded-xl bg-slate-100 p-3 font-semibold">
          {mode === 'login' ? 'Criar uma conta' : 'Já tenho uma conta'}
        </button>
      </form>
    </div>
  )
}
