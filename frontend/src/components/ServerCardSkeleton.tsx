export default function ServerCardSkeleton() {
  return (
    <div className="glass-card rounded-2xl p-5 flex flex-col gap-4 animate-pulse">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 space-y-2">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded bg-white/10" />
            <div className="h-4 w-36 bg-white/10 rounded" />
          </div>
          <div className="h-3 w-24 bg-white/10 rounded" />
          <div className="h-3 w-20 bg-white/10 rounded" />
        </div>
        <div className="h-5 w-16 bg-white/10 rounded-full" />
      </div>
      <div className="grid grid-cols-3 gap-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="bg-white/5 rounded-xl p-2.5 flex flex-col items-center gap-1.5">
            <div className="w-4 h-4 bg-white/10 rounded" />
            <div className="h-4 w-10 bg-white/10 rounded" />
            <div className="h-3 w-12 bg-white/10 rounded" />
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 pt-1 border-t border-white/5">
        <div className="h-4 w-14 bg-white/10 rounded" />
        <div className="flex-1" />
        <div className="h-7 w-8 bg-white/10 rounded-lg" />
        <div className="h-7 w-8 bg-white/10 rounded-lg" />
        <div className="h-7 w-14 bg-white/10 rounded-lg" />
      </div>
    </div>
  );
}
