export function PageSpinner() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-black/10 dark:border-white/10 border-t-indigo-500 rounded-full animate-spin" />
    </div>
  )
}
