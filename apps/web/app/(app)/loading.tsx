export default function AppLoading() {
  return <div className="mx-auto max-w-[1370px] p-4 py-8 sm:p-8 lg:p-10" aria-label="Chargement de la page" role="status">
    <div className="mb-8 space-y-3">
      <div className="skeleton h-3 w-24 rounded-full" />
      <div className="skeleton h-9 w-72 max-w-[75%] rounded-lg" />
      <div className="skeleton h-4 w-[28rem] max-w-full rounded" />
    </div>
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: 4 }, (_, index) => <div key={index} className="rounded-xl border border-white/[.075] bg-white/[.018] p-5">
        <div className="skeleton mb-8 size-9 rounded-lg" />
        <div className="skeleton mb-2 h-7 w-20 rounded" />
        <div className="skeleton h-3 w-28 rounded" />
      </div>)}
    </div>
    <div className="mt-5 grid gap-5 lg:grid-cols-[1.45fr_1fr]">
      <div className="h-80 rounded-xl border border-white/[.075] bg-white/[.018] p-5"><div className="skeleton mb-7 h-5 w-36 rounded" />{Array.from({ length: 5 }, (_, index) => <div key={index} className="mb-5 flex gap-3"><div className="skeleton size-8 shrink-0 rounded-full"/><div className="w-full space-y-2"><div className="skeleton h-3 w-2/3 rounded"/><div className="skeleton h-2.5 w-1/3 rounded"/></div></div>)}</div>
      <div className="h-80 rounded-xl border border-white/[.075] bg-white/[.018] p-5"><div className="skeleton mb-7 h-5 w-32 rounded"/><div className="skeleton h-52 w-full rounded-lg"/></div>
    </div>
    <span className="sr-only">Chargement…</span>
  </div>;
}
