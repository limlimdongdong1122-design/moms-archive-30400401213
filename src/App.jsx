import { Heart } from 'lucide-react'

function App() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center gap-4">
      <Heart className="size-10 text-rose-400" aria-hidden />
      <h1 className="text-2xl font-semibold tracking-tight">moms-archive</h1>
      <p className="text-slate-400 text-sm">Vite + React + Tailwind + lucide-react</p>
    </div>
  )
}

export default App
