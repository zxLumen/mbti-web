export function ChatBubble({ role, text }: { role: 'ai' | 'user'; text: string }) {
  return <div className={`bubble ${role}`}>{text}</div>
}
