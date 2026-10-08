export function QuickActions({ onPick }: { onPick: (v: string) => void }) {
  return (
    <div className="quick">
      <button onClick={() => onPick('更像 A')}>更像 A</button>
      <button onClick={() => onPick('更像 B')}>更像 B</button>
      <button onClick={() => onPick('不确定')}>不确定</button>
      <button onClick={() => onPick('视情况而定')}>视情况而定</button>
    </div>
  )
}
